"use client";

import { useState, useEffect, useRef } from "react";
import { Ed25519Keypair, Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import {
  generateRandomness,
  generateNonce,
  getExtendedEphemeralPublicKey,
} from "@mysten/sui/zklogin";
import { SuiClient } from "@mysten/sui/client";
import { jwtDecode } from "jwt-decode";
import { jwtToAddress } from "@mysten/sui/zklogin";
import { Transaction } from "@mysten/sui/transactions";
import { Signer } from "@mysten/sui/cryptography";
import { genAddressSeed, getZkLoginSignature } from "@mysten/sui/zklogin";
import { JwtPayload, Step1Data } from "./types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Converts a base64 string to a decimal string representation
 */
function base64ToDecimalString(base64: string): string {
  const binary = atob(base64);
  let decimal = BigInt(0);
  for (let i = 0; i < binary.length; i++) {
    decimal = decimal * BigInt(256) + BigInt(binary.charCodeAt(i));
  }
  return decimal.toString();
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FULLNODE_URL = "https://fullnode.devnet.sui.io";
const PROVER_URL = "https://prover-dev.mystenlabs.com/v1";

const STEPS = [
  "Generate ephemeral key pair, JWT randomness, and nonce",
  "Get JWT from OAuth provider (We only need iss, sub, aud)",
  "Generate random salt and derive zkLogin address",
  "Generate zero-knowledge proof",
  "Sign transaction with zk proof",
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ZkLoginPage() {
  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  const [results, setResults] = useState<(string | null)[]>(
    Array(5).fill(null)
  );
  const [jwt, setJwt] = useState<JwtPayload | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [ephemeralKeyPair, setEphemeralKeyPair] =
    useState<Ed25519Keypair | null>(null);
  const [maxEpoch, setMaxEpoch] = useState<number | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [userSalt, setUserSalt] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Refs
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Restore step 1 results from sessionStorage on initial load
  useEffect(() => {
    const savedStep1Data = sessionStorage.getItem("step1Data");
    if (savedStep1Data) {
      const step1Data: Step1Data = JSON.parse(savedStep1Data);
      setResults((prev) => {
        const newResults = [...prev];
        const validityEndDate = new Date(step1Data.validityEndTime);
        newResults[0] = `Max Epoch: ${step1Data.maxEpoch}\nPublic Key: ${
          step1Data.publicKey
        }\nPrivate Key: ${step1Data.privateKey}\nRandomness: ${
          step1Data.randomness
        }\nNonce: ${
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
    if (window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const idToken = params.get("id_token");
      console.log("idToken", idToken);

      if (idToken) {
        try {
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
          // Clear the hash from the URL
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

  // ========================================================================
  // STEP EXECUTION FUNCTIONS
  // ========================================================================

  const runStep = async (stepIndex: number) => {
    switch (stepIndex) {
      case 0:
        await executeStep1();
        break;
      case 1:
        await executeStep2();
        break;
      case 2:
        await executeStep3();
        break;
      case 3:
        await executeStep4();
        break;
      case 4:
        await executeStep5();
        break;
    }
  };

  // ========================================================================
  // STEP 1: Generate ephemeral key pair, JWT randomness, and nonce
  // ========================================================================

  const executeStep1 = async () => {
    try {
      const suiClient = new SuiClient({ url: FULLNODE_URL });
      const { epoch, epochDurationMs, epochStartTimestampMs } =
        await suiClient.getLatestSuiSystemState();

      const maxEpoch = Number(epoch) + 2; // Active for 2 epochs from now
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
        publicKey: publicKey.toBase64(),
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
        newResults[0] = `Max Epoch: ${step1Data.maxEpoch}\nPublic Key: ${
          step1Data.publicKey
        }\nPrivate Key: ${step1Data.privateKey}\nRandomness: ${
          step1Data.randomness
        }\nNonce: ${
          step1Data.nonce
        }\n\nValidity Period:\n- Valid until: ${validityEndDate.toLocaleString()}\n- Duration: ${Math.round(
          step1Data.validityDuration / (1000 * 60 * 60)
        )} hours`;
        return newResults;
      });
    } catch (error) {
      console.error("Error in Step 1:", error);
      setResults((prev) => {
        const newResults = [...prev];
        newResults[0] = `❌ Error in Step 1: ${error}`;
        return newResults;
      });
    }
  };

  // ========================================================================
  // STEP 2: Get JWT from OAuth provider
  // ========================================================================

  const executeStep2 = async () => {
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

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.append("client_id", clientId);
    authUrl.searchParams.append("response_type", "id_token");
    authUrl.searchParams.append("redirect_uri", redirectUri || "");
    authUrl.searchParams.append("scope", scope);
    authUrl.searchParams.append("nonce", nonce);

    setResults((prev) => {
      const newResults = [...prev];
      newResults[1] = `Redirecting to Google OAuth...\nAuth URL: ${authUrl.toString()}`;
      return newResults;
    });

    // Redirect to Google OAuth
    window.location.href = authUrl.toString();
  };

  // ========================================================================
  // STEP 3: Generate random salt and derive zkLogin address
  // ========================================================================

  const executeStep3 = async () => {
    const inputValue = passwordInputRef.current?.value || "";
    if (!inputValue) {
      setResults((prev) => {
        const newResults = [...prev];
        newResults[2] = "Please enter a password.";
        return newResults;
      });
      return;
    }

    try {
      // Generate a random 16-byte salt
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const saltBigInt = BigInt(
        "0x" +
          Array.from(randomBytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
      );

      setUserSalt(saltBigInt.toString());
      sessionStorage.setItem("userSalt", saltBigInt.toString());

      // If idToken and userSalt are present, derive the address
      const userSaltStr = sessionStorage.getItem("userSalt");
      if (idToken && userSaltStr) {
        const derivedAddress = jwtToAddress(idToken, userSaltStr);
        setAddress(derivedAddress);
        setResults((prev) => {
          const newResults = [...prev];
          newResults[2] = `Random 16-byte salt generated: ${saltBigInt.toString()}\nDerived zkLogin address: ${derivedAddress}`;
          newResults[3] = null; // Clear step 4 result since merged
          return newResults;
        });
      } else {
        setResults((prev) => {
          const newResults = [...prev];
          newResults[2] = "Please ensure both JWT and salt are available.";
          newResults[3] = null;
          return newResults;
        });
      }
    } catch (err) {
      setResults((prev) => {
        const newResults = [...prev];
        newResults[2] = `Error generating salt: ${err}`;
        newResults[3] = null;
        return newResults;
      });
    }
  };

  // ========================================================================
  // STEP 4: Generate zero-knowledge proof
  // ========================================================================

  const executeStep4 = async () => {
    const step1DataStr = sessionStorage.getItem("step1Data");
    const userSaltStr = sessionStorage.getItem("userSalt");

    if (!idToken || !step1DataStr || !userSaltStr) {
      setResults((prev) => {
        const newResults = [...prev];
        newResults[3] = "Missing required data. Run Steps 1-3 first.";
        return newResults;
      });
      return;
    }

    let requestBody: any;

    try {
      const step1Data = JSON.parse(step1DataStr);
      console.log("step1Data.publicKey", step1Data.publicKey);

      // Extract public and private keys from step1Data
      const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(
        new Ed25519PublicKey(step1Data.publicKey)
      );

      const base64Details = base64ToDecimalString(extendedEphemeralPublicKey);
      requestBody = {
        jwt: idToken as string,
        extendedEphemeralPublicKey: base64Details,
        maxEpoch: step1Data.maxEpoch,
        jwtRandomness: step1Data.randomness,
        salt: userSaltStr,
        keyClaimName: "sub",
      };

      console.log(
        "Sending request to prover:",
        JSON.stringify(requestBody, null, 2)
      );

      const response = await fetch(PROVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorDetails = "";
        try {
          const errorBody = await response.text();
          errorDetails = `\nResponse Body: ${errorBody}`;
        } catch (parseError) {
          errorDetails = "\nCould not parse error response body";
        }

        throw new Error(
          `Prover error: ${response.status} ${response.statusText}${errorDetails}`
        );
      }

      const zkProof = await response.json();
      console.log("zkProof:", zkProof);

      setResults((prev) => {
        const newResults = [...prev];
        newResults[3] = `✅ Proof generated successfully.\nPartial output:\n${JSON.stringify(
          zkProof,
          null,
          2
        ).slice(0, 800)}...`;
        return newResults;
      });

      sessionStorage.setItem("zkProof", JSON.stringify(zkProof));
    } catch (err) {
      console.error(err);
      setResults((prev) => {
        const newResults = [...prev];
        newResults[3] = `❌ Error fetching proof: ${err}\n\nRequest sent:\n${JSON.stringify(
          requestBody,
          null,
          2
        )}`;
        return newResults;
      });
    }
  };

  // ========================================================================
  // STEP 5: Sign transaction with zk proof
  // ========================================================================

  const executeStep5 = async () => {
    const zkProofStr = sessionStorage.getItem("zkProof");
    const step1DataStr = sessionStorage.getItem("step1Data");
    const userSaltStr = sessionStorage.getItem("userSalt");

    if (!idToken || !zkProofStr || !step1DataStr || !userSaltStr) {
      setResults((prev) => {
        const newResults = [...prev];
        newResults[4] =
          "Missing required data. Please complete Steps 1-4 first.";
        return newResults;
      });
      return;
    }

    try {
      const zkProof = JSON.parse(zkProofStr);
      const step1Data = JSON.parse(step1DataStr);
      const ephemeralKeyPair = new Ed25519Keypair({
        publicKey: step1Data.publicKey,
        secretKey: step1Data.privateKey,
      });

      const client = new SuiClient({ url: FULLNODE_URL });

      // Create a simple transaction (transfer 0 SUI to self)
      const txb = new Transaction();
      txb.setSender(address || "");

      // Add a simple transfer to self (0 SUI) as a test transaction
      txb.transferObjects([txb.gas], txb.pure.address(address || ""));

      const { bytes, signature: userSignature } = await txb.sign({
        client,
        signer: ephemeralKeyPair as Signer,
      });

      // Create the zkLogin signature
      const addressSeed = genAddressSeed(
        BigInt(userSaltStr),
        "sub",
        jwt?.sub ?? "",
        jwt?.aud as string
      ).toString();

      const zkLoginSignature = getZkLoginSignature({
        inputs: {
          addressSeed,
          issBase64Details: zkProof.issBase64Details,
          headerBase64: zkProof.headerBase64,
          proofPoints: zkProof.proofPoints,
        },
        maxEpoch: step1Data.maxEpoch,
        userSignature,
      });

      setResults((prev) => {
        const newResults = [...prev];
        newResults[4] = `✅ Transaction signed with zkLogin!\n\nUser Signature: ${userSignature}\nZkLogin Signature: ${zkLoginSignature}\nTransaction Bytes: ${bytes}`;
        return newResults;
      });
    } catch (err) {
      console.error("Error signing transaction:", err);
      setResults((prev) => {
        const newResults = [...prev];
        newResults[4] = `❌ Error signing transaction: ${err}`;
        return newResults;
      });
    }
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center">zkLogin Demo</h1>

      <div className="space-y-6">
        {/* Step 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Step 1: {STEPS[0]}</span>
              <Button onClick={() => runStep(0)}>Run Step 1</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results[0] && (
              <>
                <Alert variant="destructive" className="mb-4">
                  <AlertTitle>
                    WARNING: This is a demo. DO NOT use these keys for real
                    money transactions!
                  </AlertTitle>
                </Alert>
                <pre className="bg-gray-100 p-4 rounded-lg whitespace-pre-wrap text-sm text-black border">
                  {results[0]}
                </pre>
              </>
            )}
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Step 2: {STEPS[1]}</span>
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
              <span>Step 3: {STEPS[2]}</span>
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
              <span>Step 4: {STEPS[3]}</span>
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
              <span>Step 5: {STEPS[4]}</span>
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
