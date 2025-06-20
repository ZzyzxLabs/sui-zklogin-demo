"use client";

import { useState, useEffect, useRef } from "react";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateRandomness, generateNonce } from "@mysten/sui/zklogin";
import { SuiClient } from "@mysten/sui/client";
import { jwtDecode } from "jwt-decode";
import { jwtToAddress } from "@mysten/sui/zklogin";
import { Transaction } from "@mysten/sui/transactions";
import { Signer } from "@mysten/sui/cryptography";
import { genAddressSeed, getZkLoginSignature } from "@mysten/sui/zklogin";
import { JwtPayload, Step1Data } from "./types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ZkLoginPage() {
  const [results, setResults] = useState<(string | null)[]>(
    Array(5).fill(null)
  );
  const [jwt, setJwt] = useState<JwtPayload | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [ephemeralKeyPair, setEphemeralKeyPair] =
    useState<Ed25519Keypair | null>(null);

  // Step 1
  const [maxEpoch, setMaxEpoch] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [userSalt, setUserSalt] = useState<string | null>(null);

  // Remove userSalt state, use ref instead
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Restore step 1 results from sessionStorage on initial load
  useEffect(() => {
    const savedStep1Data = sessionStorage.getItem("step1Data");
    if (savedStep1Data) {
      const step1Data: Step1Data = JSON.parse(savedStep1Data);
      setResults((prev) => {
        const newResults = [...prev];
        const validityEndDate = new Date(step1Data.validityEndTime);
        newResults[0] = `⚠️ WARNING: This is a demo. DO NOT use these keys for real money transactions! ⚠️\n\nMax Epoch: ${
          step1Data.maxEpoch
        }\nPublic Key: ${step1Data.publicKey}\nPrivate Key: ${
          step1Data.privateKey
        }\nRandomness: ${step1Data.randomness}\nNonce: ${
          step1Data.nonce
        }\n\nValidity Period:\n- Valid until: ${validityEndDate.toLocaleString()}\n- Duration: ${Math.round(
          step1Data.validityDuration / (1000 * 60 * 60)
        )} hours`;
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
      console.log("idToken", idToken);
      if (idToken) {
        try {
          // Use jwtDecode to decode the id_token
          const payload = jwtDecode<JwtPayload>(idToken);
          setJwt(payload);
          setIdToken(idToken);
          setResults((prev) => {
            const newResults = [...prev];
            newResults[1] = `JWT received:\nIssuer: ${
              payload.iss ?? ""
            }\nSubject: ${payload.sub ?? ""}\nAudience: ${payload.aud ?? ""}`;
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
    "Generate ephemeral key pair, JWT randomness, and nonce",
    "Get JWT from OAuth provider (We only need iss, sub, aud)",
    "Create password (for salt/derivation) and derive zkLogin address",
    "Generate zero-knowledge proof",
    "Sign transaction with zk proof",
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
        setEphemeralKeyPair(ephemeralKeyPair);
        const publicKey = ephemeralKeyPair.getPublicKey();
        const privateKey = ephemeralKeyPair.getSecretKey();
        const randomness = generateRandomness();
        const nonce = generateNonce(publicKey, maxEpoch, randomness);

        // Calculate validity period
        const currentEpochStartTime = Number(epochStartTimestampMs);
        const epochsRemaining = maxEpoch - Number(epoch);
        const validityEndTime =
          currentEpochStartTime + epochsRemaining * Number(epochDurationMs);
        const validityEndDate = new Date(validityEndTime);
        const validityDuration = epochsRemaining * Number(epochDurationMs);

        // Save step 1 data to sessionStorage
        const step1Data: Step1Data = {
          maxEpoch,
          publicKey: publicKey.toSuiPublicKey(),
          privateKey: privateKey,
          randomness,
          nonce,
          validityEndTime,
          validityDuration,
        };
        sessionStorage.setItem("step1Data", JSON.stringify(step1Data));

        setResults((prev) => {
          const newResults = [...prev];
          const validityEndDate = new Date(step1Data.validityEndTime);
          newResults[0] = `⚠️ WARNING: This is a demo. DO NOT use these keys for real money transactions! ⚠️\n\nMax Epoch: ${
            step1Data.maxEpoch
          }\nPublic Key: ${step1Data.publicKey}\nPrivate Key: ${
            step1Data.privateKey
          }\nRandomness: ${step1Data.randomness}\nNonce: ${
            step1Data.nonce
          }\n\nValidity Period:\n- Valid until: ${validityEndDate.toLocaleString()}\n- Duration: ${Math.round(
            step1Data.validityDuration / (1000 * 60 * 60)
          )} hours`;
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
        // Get the password from the input ref
        const inputValue = passwordInputRef.current?.value || "";
        if (!inputValue) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[2] = "Please enter a password.";
            return newResults;
          });
          break;
        }
        // Convert to bigint and store in sessionStorage as string
        try {
          const hexString = Array.from(inputValue)
            .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
            .join("");
          const saltBigInt = BigInt("0x" + hexString);
          setUserSalt(saltBigInt.toString());
          sessionStorage.setItem("userSalt", saltBigInt.toString());
          // If idToken and userSalt are present, derive the address
          const userSaltStr = sessionStorage.getItem("userSalt");
          if (idToken && userSaltStr) {
            const derivedAddress = jwtToAddress(idToken, userSaltStr);
            setAddress(derivedAddress);
            setResults((prev) => {
              const newResults = [...prev];
              newResults[2] = `Password (userSalt) saved as bigint.\nDerived zkLogin address: ${derivedAddress}`;
              newResults[3] = null; // Clear step 4 result since merged
              return newResults;
            });
          } else {
            setResults((prev) => {
              const newResults = [...prev];
              newResults[2] =
                "Please ensure both JWT and password are available.";
              newResults[3] = null;
              return newResults;
            });
          }
        } catch (err) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[2] = `Error converting password to bigint: ${err}`;
            newResults[3] = null;
            return newResults;
          });
        }
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
          newResults[3] = `Generating zero-knowledge proof using JWT claims:\nSub: ${
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
        if (!address) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[4] =
              "Error: No derived address available. Please complete Step 3 first.";
            return newResults;
          });
          return;
        }
        if (!ephemeralKeyPair) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[4] =
              "Error: No ephemeral key pair available. Please complete Step 1 first.";
            return newResults;
          });
          return;
        }
        try {
          const client = new SuiClient({
            url: "https://fullnode.testnet.sui.io",
          });
          const txb = new Transaction();
          txb.setSender(address);
          const { bytes, signature: userSignature } = await txb.sign({
            client,
            signer: ephemeralKeyPair as Signer, // This must be the same ephemeral key pair used in the ZKP request
          });

          const addressSeed = genAddressSeed(
            BigInt(userSalt ?? ""),
            "sub",
            jwt.sub ?? "",
            jwt.aud as string
          ).toString();

          setResults((prev) => {
            const newResults = [...prev];
            newResults[4] = `Transaction signed!\nSignature: ${userSignature}\nBytes: ${bytes}`;
            return newResults;
          });
        } catch (err) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[4] = `Error signing transaction: ${err}`;
            return newResults;
          });
        }
        break;
      }
    }
  };

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center">zkLogin Demo</h1>

      <div className="space-y-6">
        {/* Step 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Step 1: {steps[0]}</span>
              <Button onClick={() => runStep(0)}>Run Step 1</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results[0] && (
              <pre className="bg-gray-100 p-4 rounded-lg whitespace-pre-wrap text-sm text-black border">
                {results[0]}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Step 2: {steps[1]}</span>
              <Button onClick={() => runStep(1)}>Run Step 2</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results[1] && (
              <pre className="bg-gray-100 p-4 rounded-lg whitespace-pre-wrap text-sm text-black border">
                {results[1]}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* Step 3 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Step 3: {steps[2]}</span>
              <div className="flex items-center gap-2">
                <input
                  id="password-inbox"
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  className="border rounded px-3 py-1 text-black bg-white"
                  placeholder="Enter your password"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? "Hide" : "Show"}
                </Button>
                <Button onClick={() => runStep(2)}>Run Step 3</Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results[2] && (
              <pre className="bg-gray-100 p-4 rounded-lg whitespace-pre-wrap text-sm text-black border">
                {results[2]}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* Step 4 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Step 4: {steps[3]}</span>
              <Button onClick={() => runStep(3)}>Run Step 4</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results[3] && (
              <pre className="bg-gray-100 p-4 rounded-lg whitespace-pre-wrap text-sm text-black border">
                {results[3]}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* Step 5 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Step 5: {steps[4]}</span>
              <Button onClick={() => runStep(4)}>Run Step 5</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results[4] && (
              <pre className="bg-gray-100 p-4 rounded-lg whitespace-pre-wrap text-sm text-black border">
                {results[4]}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
