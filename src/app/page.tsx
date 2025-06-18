"use client";

import { useState, useEffect } from "react";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateRandomness, generateNonce } from "@mysten/sui/zklogin";
import { SuiClient } from "@mysten/sui/client";
import { jwtDecode } from "jwt-decode";

interface JwtPayload {
  iss?: string;
  sub?: string; //Subject ID
  aud?: string[] | string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
}

interface Step1Data {
  maxEpoch: number;
  publicKey: string;
  privateKey: string;
  randomness: string;
  nonce: string;
}

export default function ZkLoginPage() {
  const [results, setResults] = useState<(string | null)[]>(
    Array(6).fill(null)
  );
  const [jwt, setJwt] = useState<JwtPayload | null>(null);
  const [ephemeralKeyPair, setEphemeralKeyPair] =
    useState<Ed25519Keypair | null>(null);
  const [maxEpoch, setMaxEpoch] = useState<number | null>(null);
  const [randomness, setRandomness] = useState<string | null>(null);

  // Restore step 1 results from sessionStorage on initial load
  useEffect(() => {
    const savedStep1Data = sessionStorage.getItem("step1Data");
    if (savedStep1Data) {
      const step1Data: Step1Data = JSON.parse(savedStep1Data);
      setResults((prev) => {
        const newResults = [...prev];
        newResults[0] = `⚠️ WARNING: This is a demo. DO NOT use these keys for real money transactions! ⚠️\n\nMax Epoch: ${maxEpoch}\nPublic Key: ${step1Data.publicKey}\nPrivate Key: ${step1Data.privateKey}\nRandomness: ${step1Data.randomness}\nNonce: ${step1Data.nonce}`;
        return newResults;
      });
    }
  }, []);

  // Handle id_token from OAuth callback
  useEffect(() => {
    // Check for id_token in the URL fragment (after #)
    if (window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const idToken = params.get("id_token");
      if (idToken) {
        try {
          // Use jwtDecode to decode the id_token
          const payload = jwtDecode<JwtPayload>(idToken);
          setJwt(payload);
          setResults((prev) => {
            const newResults = [...prev];
            newResults[1] = `JWT received:\nIssuer: ${
              payload.iss ?? ""
            }\nSub: ${payload.sub ?? ""}\nAudience: ${
              payload.aud ?? ""
            }\nExpires: ${payload.exp ?? ""}\nNot Before: ${
              payload.nbf ?? ""
            }\nIssued At: ${payload.iat ?? ""}\nJWT ID: ${payload.jti ?? ""}`;
            return newResults;
          });
          // Optionally, clear the hash from the URL
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        } catch (error) {
          console.error("Error decoding id_token with jwtDecode:", error);
        }
      }
    }
  }, []);

  const steps = [
    "Step 1: Generate ephemeral key pair, JWT randomness, and nonce",
    "Step 2: Get JWT from OAuth provider",
    "Step 3: Register or fetch salt",
    "Step 4: Derive zkLogin address",
    "Step 5: Generate zero-knowledge proof",
    "Step 6: Sign transaction with zk proof",
  ];

  const runStep = async (stepIndex: number) => {
    switch (stepIndex) {
      case 0: {
        const FULLNODE_URL = "https://fullnode.testnet.sui.io";
        const suiClient = new SuiClient({ url: FULLNODE_URL });
        const { epoch, epochDurationMs, epochStartTimestampMs } =
          await suiClient.getLatestSuiSystemState();

        const maxEpoch = Number(epoch) + 2; // this means the ephemeral key will be active for 2 epochs from now.
        const ephemeralKeyPair = new Ed25519Keypair();
        const publicKey = ephemeralKeyPair.getPublicKey();
        const privateKey = ephemeralKeyPair.getSecretKey();
        const randomness = generateRandomness();
        const nonce = generateNonce(publicKey, maxEpoch, randomness);

        // Save step 1 data to sessionStorage
        const step1Data: Step1Data = {
          maxEpoch,
          publicKey: publicKey.toSuiPublicKey(),
          privateKey: privateKey,
          randomness,
          nonce,
        };
        sessionStorage.setItem("step1Data", JSON.stringify(step1Data));

        setResults((prev) => {
          const newResults = [...prev];
          newResults[0] = `⚠️ WARNING: This is a demo. DO NOT use these keys for real money transactions! ⚠️\n\nMax Epoch: ${maxEpoch}\nPublic Key: ${step1Data.publicKey}\nPrivate Key: ${step1Data.privateKey}\nRandomness: ${step1Data.randomness}\nNonce: ${step1Data.nonce}`;
          return newResults;
        });
        break;
      }
      case 1: {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[1] = "Error: Google Client ID not configured";
            return newResults;
          });
          return;
        }

        // Get the nonce from step 1 results
        const step1DataStr = sessionStorage.getItem("step1Data");
        const nonce = step1DataStr ? JSON.parse(step1DataStr).nonce : null;
        if (!nonce) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[1] = "Error: Please run Step 1 first to generate nonce";
            return newResults;
          });
          return;
        }

        // Use implicit flow: response_type=id_token, redirect_uri is frontend
        const redirectUri = process.env.NEXT_PUBLIC_BASE_URL;
        const scope = "openid";
        const nonceParam = btoa(JSON.stringify({ nonce }));

        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.append("client_id", clientId);
        authUrl.searchParams.append("response_type", "id_token");
        authUrl.searchParams.append("redirect_uri", redirectUri || "");
        authUrl.searchParams.append("scope", scope);
        authUrl.searchParams.append("nonce", nonceParam);

        setResults((prev) => {
          const newResults = [...prev];
          newResults[1] = `Redirecting to Google OAuth...\nAuth URL: ${authUrl.toString()}`;
          return newResults;
        });

        // Redirect to Google OAuth
        window.location.href = authUrl.toString();
        break;
      }
      case 2: {
        if (!jwt) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[2] =
              "Error: No JWT data available. Please complete Step 2 first.";
            return newResults;
          });
          return;
        }

        // Here you would typically make a call to your salt service
        // For now, we'll just show a placeholder
        setResults((prev) => {
          const newResults = [...prev];
          newResults[2] = `Using JWT data to register/fetch salt:\nSub: ${
            jwt.sub ?? ""
          }`;
          return newResults;
        });
        break;
      }
      case 3: {
        if (!jwt) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[3] =
              "Error: No JWT data available. Please complete Step 2 first.";
            return newResults;
          });
          return;
        }

        setResults((prev) => {
          const newResults = [...prev];
          newResults[3] = `Deriving zkLogin address using JWT claims:\nSub: ${
            jwt.sub ?? ""
          }`;
          return newResults;
        });
        break;
      }
      case 4: {
        if (!jwt) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[4] =
              "Error: No JWT data available. Please complete Step 2 first.";
            return newResults;
          });
          return;
        }

        setResults((prev) => {
          const newResults = [...prev];
          newResults[4] = `Generating zero-knowledge proof using JWT claims:\nSub: ${
            jwt.sub ?? ""
          }`;
          return newResults;
        });
        break;
      }
      case 5: {
        if (!jwt) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[5] =
              "Error: No JWT data available. Please complete Step 2 first.";
            return newResults;
          });
          return;
        }

        setResults((prev) => {
          const newResults = [...prev];
          newResults[5] = `Signing transaction using zk proof and JWT data:\nSub: ${
            jwt.sub ?? ""
          }`;
          return newResults;
        });
        break;
      }
    }
  };

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">zkLogin Demo</h1>

      <div className="space-y-6">
        {steps.map((step, index) => (
          <div key={index} className="border rounded p-4">
            <div className="flex justify-between items-center mb-2">
              <p className="font-medium">{step}</p>
              <button
                onClick={() => runStep(index)}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
              >
                Run Step {index + 1}
              </button>
            </div>
            {results[index] && (
              <pre className="mt-2 bg-gray-100 p-3 rounded whitespace-pre-wrap text-sm text-black">
                {results[index]}
              </pre>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
