"use client";

import { useState } from "react";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateRandomness, generateNonce } from "@mysten/sui/zklogin";
import { SuiClient } from "@mysten/sui/client";

export default function ZkLoginPage() {
  const [results, setResults] = useState<(string | null)[]>(
    Array(6).fill(null)
  );

  const steps = [
    "Step 1: Setup key pair and randomness",
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
        const { epoch } = await suiClient.getLatestSuiSystemState();
        const maxEpoch = Number(epoch) + 2;
        const ephemeralKeyPair = new Ed25519Keypair();
        const randomness = generateRandomness();
        const nonce = generateNonce(
          ephemeralKeyPair.getPublicKey(),
          maxEpoch,
          randomness
        );
        setResults((prev) => {
          const newResults = [...prev];
          newResults[0] = `Ephemeral Public Key: ${ephemeralKeyPair
            .getPublicKey()
            .toBase64()}\nRandomness: ${randomness}\nNonce: ${nonce}\nMax Epoch: ${maxEpoch}`;
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
        const nonceLine = results[0]
          ?.split("\n")
          .find((line) => line.startsWith("Nonce:"));
        if (!nonceLine) {
          setResults((prev) => {
            const newResults = [...prev];
            newResults[1] = "Error: Please run Step 1 first to generate nonce";
            return newResults;
          });
          return;
        }

        const nonce = nonceLine.split(": ")[1];
        const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/oauth2callback`;
        const scope = "openid email profile";

        // Create state parameter with nonce
        const state = btoa(JSON.stringify({ nonce }));

        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.append("response_type", "code");
        authUrl.searchParams.append("client_id", clientId);
        authUrl.searchParams.append("redirect_uri", redirectUri);
        authUrl.searchParams.append("scope", scope);
        authUrl.searchParams.append("state", state);
        authUrl.searchParams.append("prompt", "select_account");
        authUrl.searchParams.append("access_type", "offline");

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
        setResults((prev) => {
          const newResults = [...prev];
          newResults[2] =
            "Register new salt or fetch existing salt for the user";
          return newResults;
        });
        break;
      }
      case 3: {
        setResults((prev) => {
          const newResults = [...prev];
          newResults[3] = "Derive zkLogin address using JWT claims and salt";
          return newResults;
        });
        break;
      }
      case 4: {
        setResults((prev) => {
          const newResults = [...prev];
          newResults[4] =
            "Generate zero-knowledge proof using JWT claims and ephemeral key";
          return newResults;
        });
        break;
      }
      case 5: {
        setResults((prev) => {
          const newResults = [...prev];
          newResults[5] =
            "Sign transaction using zk proof and ephemeral signature";
          return newResults;
        });
        break;
      }
    }
  };

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">zkLogin Walkthrough</h1>

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
