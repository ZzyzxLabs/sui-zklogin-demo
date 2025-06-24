"use client";

import { useState, useEffect, useRef } from "react";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
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
import { JwtPayload, Step1Data, Ed25519KeypairData } from "./types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import * as bech32 from "bech32";

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

/**
 * Ensures an address is in proper hex format
 */
function ensureHexAddress(address: string): string {
  // Remove any non-hex characters and ensure it starts with 0x
  let cleanAddress = address.replace(/[^0-9a-fA-F]/g, "");

  // If it doesn't start with 0x, add it
  if (!cleanAddress.startsWith("0x")) {
    cleanAddress = "0x" + cleanAddress;
  }

  // Ensure it's the correct length (42 characters including 0x)
  if (cleanAddress.length !== 42) {
    throw new Error(
      `Invalid address length: ${cleanAddress.length}, expected 42`
    );
  }

  return cleanAddress.toLowerCase();
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
  const [loading, setLoading] = useState<boolean[]>(Array(5).fill(false));
  const [jwt, setJwt] = useState<JwtPayload | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [ephemeralKeyPair, setEphemeralKeyPair] =
    useState<Ed25519Keypair | null>(null);
  const [maxEpoch, setMaxEpoch] = useState<number | null>(null);
  const [randomness, setRandomness] = useState<string | null>(null);
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
    if (savedStep1Data && !results[0]) {
      const step1Data: Step1Data = JSON.parse(savedStep1Data, (key, value) => {
        if (key === "publicKey" || key === "secretKey") {
          return new Uint8Array(value);
        }
        return value;
      });

      // === Restore ephemeralKeyPair ===
      const restoredKeyPair = new Ed25519Keypair({
        publicKey: step1Data.keypairData.publicKey,
        secretKey: step1Data.keypairData.secretKey,
      });
      setEphemeralKeyPair(restoredKeyPair);

      // show restored secret key
      console.log("Restored secret key:", restoredKeyPair.getSecretKey());

      // === Restore other step1 data ===
      setMaxEpoch(step1Data.maxEpoch);
      setRandomness(step1Data.randomness);

      setResults((prev) => {
        const newResults = [...prev];
        const validityEndDate = new Date(step1Data.validityEndTime);
        // display keys in base64 for public key and bech32 for private key
        const publicKeyRawBytes = step1Data.keypairData.publicKey;
        const privateKeyRawBytes = step1Data.keypairData.secretKey;
        const publicKeyBase64 =
          Buffer.from(publicKeyRawBytes).toString("base64");
        const privateKeyBech32 = restoredKeyPair.getSecretKey(); // Use the original bech32 format
        newResults[0] = `Max Epoch: ${
          step1Data.maxEpoch
        }\nPublic Key (base64): ${publicKeyBase64}\nPrivate Key (bech32): ${privateKeyBech32}\nRandomness: ${
          step1Data.randomness
        }\nNonce: ${
          step1Data.nonce
        }\n\nValidity Period:\n- Valid until: ${validityEndDate.toLocaleString()}\n- Duration: ${Math.round(
          step1Data.validityDuration / (1000 * 60 * 60)
        )} hours`;
        return newResults;
      });
    }
  }, [results[0]]);

  // Handle id_token from OAuth callback
  useEffect(() => {
    if (window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const idToken = params.get("id_token");
      console.log("idToken", idToken);

      // Debug: Check sessionStorage after OAuth redirect
      console.log("=== OAUTH CALLBACK DEBUGGING ===");
      const step1DataAfterOAuth = sessionStorage.getItem("step1Data");
      console.log("Step1 data after OAuth:", step1DataAfterOAuth);
      if (step1DataAfterOAuth) {
        try {
          const parsedData = JSON.parse(step1DataAfterOAuth);
          console.log("Parsed step1 data after OAuth:", parsedData);
          console.log(
            "Public key after OAuth:",
            parsedData.keypairData?.publicKey
          );
          console.log(
            "Secret key after OAuth:",
            parsedData.keypairData?.secretKey
          );
        } catch (error) {
          console.log("Error parsing step1 data after OAuth:", error);
        }
      }
      console.log("=== END OAUTH DEBUGGING ===");

      if (idToken) {
        try {
          const payload = jwtDecode<JwtPayload>(idToken);
          setJwt(payload);
          setIdToken(idToken);

          // Get the private key from sessionStorage for display
          const step1DataStr = sessionStorage.getItem("step1Data");
          let privateKeyDisplay = "Private key not found";
          if (step1DataStr) {
            try {
              const step1Data = JSON.parse(step1DataStr);
              // Reconstruct the keypair to get the bech32 format
              const restoredKeyPair = new Ed25519Keypair({
                publicKey: step1Data.keypairData.publicKey,
                secretKey: step1Data.keypairData.secretKey,
              });
              privateKeyDisplay = restoredKeyPair.getSecretKey();
            } catch (error) {
              console.log(
                "Error parsing step1 data for private key display:",
                error
              );
            }
          }

          setResults((prev) => {
            const newResults = [...prev];
            newResults[1] = `JWT received:\nIssuer: ${
              payload.iss ?? ""
            }\nSubject: ${payload.sub ?? ""}\nAudience: ${
              payload.aud ?? ""
            }\n\nPrivate Key (bech32): ${privateKeyDisplay}`;
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
  }, []); // Keep this as empty dependency array to only run once

  // ========================================================================
  // STEP EXECUTION FUNCTIONS
  // ========================================================================

  const runStep = async (stepIndex: number) => {
    // Set loading state for this step
    setLoading((prev) => {
      const newLoading = [...prev];
      newLoading[stepIndex] = true;
      return newLoading;
    });

    try {
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
    } finally {
      // Clear loading state for this step
      setLoading((prev) => {
        const newLoading = [...prev];
        newLoading[stepIndex] = false;
        return newLoading;
      });
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

      // Set state variables
      setMaxEpoch(maxEpoch);
      setRandomness(randomness);

      // Debug: Log original keypair details
      console.log("=== STEP 1 KEYPAIR DEBUGGING ===");
      console.log("Original ephemeralKeyPair:", ephemeralKeyPair);
      console.log("Original public key (base64):", publicKey.toBase64());
      console.log("Original public key (raw bytes):", publicKey.toRawBytes());
      console.log("Original secret key (bech32):", privateKey);

      // Decode the bech32-encoded secret key to get raw bytes
      const decodedSecretKey = bech32.bech32.decode(privateKey);
      const privateKeyBytes = Uint8Array.from(
        bech32.bech32.fromWords(decodedSecretKey.words)
      ).slice(1);
      const publicKeyBytes = publicKey.toRawBytes();

      // Create the 64-byte secret key: 32 bytes secret scalar + 32 bytes public key
      const fullSecretKeyBytes = new Uint8Array(64);
      fullSecretKeyBytes.set(privateKeyBytes, 0);
      fullSecretKeyBytes.set(publicKeyBytes, 32);

      // Calculate validity period
      const currentEpochStartTime = Number(epochStartTimestampMs);
      const epochsRemaining = maxEpoch - Number(epoch);
      const validityEndTime =
        currentEpochStartTime + epochsRemaining * Number(epochDurationMs);
      const validityEndDate = new Date(validityEndTime);
      const validityDuration = epochsRemaining * Number(epochDurationMs);

      //verify they keypair
      const testKeypair = new Ed25519Keypair({
        publicKey: publicKey.toRawBytes(),
        secretKey: fullSecretKeyBytes,
      });
      console.log("Test keypair:", testKeypair);
      console.log(
        "Test keypair public key:",
        testKeypair.getPublicKey().toBase64()
      );
      console.log("Test keypair secret key:", testKeypair.getSecretKey());
      console.log(
        "Original vs Test secret key match:",
        privateKey === testKeypair.getSecretKey()
      );

      // Save step 1 data to sessionStorage
      const step1Data: Step1Data = {
        maxEpoch,
        keypairData: {
          publicKey: publicKey.toRawBytes(),
          secretKey: fullSecretKeyBytes,
        },
        randomness,
        nonce,
        validityEndTime,
        validityDuration,
      };
      sessionStorage.setItem(
        "step1Data",
        JSON.stringify(step1Data, (key, value) => {
          if (value instanceof Uint8Array) {
            return Array.from(value);
          }
          return value;
        })
      );

      setResults((prev) => {
        const newResults = [...prev];
        const validityEndDate = new Date(step1Data.validityEndTime);
        const publicKeyRawBytes = step1Data.keypairData.publicKey;
        const privateKeyRawBytes = step1Data.keypairData.secretKey;
        // display keys in base64 for public key and bech32 for private key
        const publicKeyBase64 =
          Buffer.from(publicKeyRawBytes).toString("base64");
        const privateKeyBech32 = ephemeralKeyPair.getSecretKey(); // Use the original bech32 format
        newResults[0] = `Max Epoch: ${
          step1Data.maxEpoch
        }\nPublic Key (base64): ${publicKeyBase64}\nPrivate Key (bech32): ${privateKeyBech32}\nRandomness: ${
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
      newResults[1] = `Redirecting to Google OAuth...`;
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
      // const saltBigInt = BigInt(
      //   "0x" +
      //     Array.from(randomBytes)
      //       .map((b) => b.toString(16).padStart(2, "0"))
      //       .join("")
      // );

      const saltBigInt = "0x00000000000000000000000000000000";
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
    const userSaltStr = sessionStorage.getItem("userSalt");

    if (
      !idToken ||
      !userSaltStr ||
      !ephemeralKeyPair ||
      !maxEpoch ||
      !randomness
    ) {
      setResults((prev) => {
        const newResults = [...prev];
        newResults[3] = "Missing required data. Run Steps 1-3 first.";
        return newResults;
      });
      return;
    }

    let requestBody: any;

    try {
      // Use the restored keypair from state instead of sessionStorage
      const publicKey = ephemeralKeyPair.getPublicKey();
      console.log("Using restored public key:", publicKey.toBase64());

      // Extract public and private keys from restored keypair
      const extendedEphemeralPublicKey =
        getExtendedEphemeralPublicKey(publicKey);

      const base64Details = base64ToDecimalString(extendedEphemeralPublicKey);

      // Debug: Check address seed consistency
      const addressSeedForProver = genAddressSeed(
        BigInt(userSaltStr),
        "sub",
        jwt?.sub ?? "",
        Array.isArray(jwt?.aud) ? jwt.aud[0] : jwt?.aud ?? ""
      ).toString();

      console.log("Address seed for prover:", addressSeedForProver);
      console.log("JWT sub for prover:", jwt?.sub);
      console.log("JWT aud for prover:", jwt?.aud);
      console.log("User salt for prover:", userSaltStr);

      requestBody = {
        jwt: idToken as string,
        extendedEphemeralPublicKey: base64Details,
        maxEpoch: maxEpoch,
        jwtRandomness: randomness,
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
      const step1Data = JSON.parse(step1DataStr, (key, value) => {
        if (key === "publicKey" || key === "secretKey") {
          return new Uint8Array(value);
        }
        return value;
      });

      // Use the restored keypair from state instead of reconstructing
      if (!ephemeralKeyPair) {
        throw new Error(
          "Ephemeral keypair not found. Please run Step 1 first."
        );
      }

      // show restored keypair in base64
      console.log("=== KEYPAIR DEBUGGING ===");
      // show step1Date secret key in bech32
      const step1DataRestoredKeypair = new Ed25519Keypair({
        publicKey: step1Data.keypairData.publicKey,
        secretKey: step1Data.keypairData.secretKey,
      });
      const step1DataSecretKeyBech32 = step1DataRestoredKeypair.getSecretKey();
      console.log("Step1 data secret key (bech32):", step1DataSecretKeyBech32);
      console.log(
        "Restored keypair public key:",
        ephemeralKeyPair.getPublicKey().toBase64()
      );
      console.log(
        "Restored keypair secret key:",
        ephemeralKeyPair.getSecretKey()
      );

      // Assertions to check correctness
      const originalPublicKeyBase64 = Buffer.from(
        step1Data.keypairData.publicKey
      ).toString("base64");
      const restoredPublicKeyBase64 = ephemeralKeyPair
        .getPublicKey()
        .toBase64();
      const originalSecretKeyBech32 = step1DataRestoredKeypair.getSecretKey();
      const restoredSecretKeyBech32 = ephemeralKeyPair.getSecretKey();

      console.log(
        "Public key lengths match:",
        step1Data.keypairData.publicKey.length ===
          ephemeralKeyPair.getPublicKey().toRawBytes().length
      );
      console.log(
        "Secret key lengths match:",
        step1Data.keypairData.secretKey.length === 64
      );

      // Check if the data from sessionStorage matches what we expect
      const step1DataFromStorage = sessionStorage.getItem("step1Data");
      console.log("Step1 data from sessionStorage:", step1DataFromStorage);

      // Assertions
      if (originalPublicKeyBase64 !== restoredPublicKeyBase64) {
        throw new Error(
          `Public key mismatch! Original: ${originalPublicKeyBase64}, Restored: ${restoredPublicKeyBase64}`
        );
      }

      if (
        step1Data.keypairData.publicKey.length !==
        ephemeralKeyPair.getPublicKey().toRawBytes().length
      ) {
        throw new Error(
          `Public key length mismatch! Original: ${
            step1Data.keypairData.publicKey.length
          }, Restored: ${ephemeralKeyPair.getPublicKey().toRawBytes().length}`
        );
      }

      if (step1Data.keypairData.secretKey.length !== 64) {
        throw new Error(
          `Secret key length mismatch! Expected 64 bytes, got ${step1Data.keypairData.secretKey.length}`
        );
      }

      if (originalSecretKeyBech32 !== restoredSecretKeyBech32) {
        throw new Error(
          `Secret key mismatch! Original: ${originalSecretKeyBech32}, Restored: ${restoredSecretKeyBech32}`
        );
      }

      console.log("✅ All keypair assertions passed!");
      console.log("=== END KEYPAIR DEBUGGING ===");

      console.log("Restored ephemeralKeyPair:", ephemeralKeyPair);
      console.log(
        "Original public key from step1:",
        step1Data.keypairData.publicKey
      );
      console.log(
        "Original secret key from step1:",
        step1Data.keypairData.secretKey
      );

      const provider = new SuiClient({ url: FULLNODE_URL });

      // Fetch balance of the current address
      let balanceInfo = "";
      if (address) {
        try {
          const balance = await provider.getBalance({
            owner: address,
            coinType: "0x2::sui::SUI",
          });
          balanceInfo = `\n💰 Current Balance: ${
            Number(balance.totalBalance) / 1000000000
          } SUI\n`;
        } catch (balanceError) {
          console.error("Error fetching balance:", balanceError);
          balanceInfo = "\n❌ Could not fetch balance\n";
        }
      }

      if (!address) {
        setResults((prev) => {
          const newResults = [...prev];
          newResults[4] = "Error: No address found";
          return newResults;
        });
        return;
      }

      // console show zkproof and ephomeralKeyPair
      console.log("zkProof", zkProof);
      console.log("ephomeralKeyPair", ephemeralKeyPair);

      // Create a simple transaction (transfer 0 SUI to self)
      const txb = new Transaction();
      console.log("Original address:", address);
      txb.setSender(address);
      txb.transferObjects([txb.gas], txb.pure.address(address));

      // Build the transaction
      const bytes = await txb.build({ client: provider });

      console.log("=== TRANSACTION DEBUGGING ===");
      console.log("Transaction bytes length:", bytes.length);
      console.log(
        "Transaction bytes (hex):",
        Buffer.from(bytes).toString("hex")
      );
      console.log("Transaction sender:", address);
      console.log("=== END TRANSACTION DEBUGGING ===");

      // Sign the transaction with the ephemeral keypair
      const { signature: userSignature } =
        await ephemeralKeyPair.signTransaction(bytes);

      console.log("=== SIGNATURE DEBUGGING ===");
      console.log("User signature length:", userSignature.length);
      console.log("User signature (base64):", userSignature);
      console.log(
        "User signature (hex):",
        Buffer.from(userSignature, "base64").toString("hex")
      );
      console.log("=== END SIGNATURE DEBUGGING ===");

      // Verify the signature locally
      let isSignatureValid = false;
      let verificationError: Error | null = null;

      try {
        isSignatureValid = await ephemeralKeyPair
          .getPublicKey()
          .verifyTransaction(bytes, userSignature);
        console.log("Local signature verification result:", isSignatureValid);
      } catch (error) {
        verificationError = error as Error;
        console.log("Signature verification error:", error);
        console.log("Error message:", verificationError.message);
        console.log("Error stack:", verificationError.stack);
      }

      if (!isSignatureValid) {
        console.log("=== SIGNATURE VERIFICATION FAILURE ANALYSIS ===");
        console.log(
          "Public key used for verification:",
          ephemeralKeyPair.getPublicKey().toBase64()
        );
        console.log(
          "Transaction bytes used for verification:",
          Buffer.from(bytes).toString("hex")
        );
        console.log("Signature used for verification:", userSignature);

        if (verificationError) {
          console.log("Verification error details:", verificationError);
        }

        // Try to verify with a different method to see if it's a method issue
        try {
          const alternativeVerification = ephemeralKeyPair
            .getPublicKey()
            .verify(bytes, userSignature);
          console.log(
            "Alternative verification result:",
            alternativeVerification
          );
        } catch (altError) {
          console.log("Alternative verification error:", altError);
        }

        console.log("=== END FAILURE ANALYSIS ===");
        throw new Error(
          `Local signature verification failed! Error: ${
            verificationError?.message || "Unknown error"
          }`
        );
      }

      // Create the zkLogin signature
      const addressSeed = genAddressSeed(
        BigInt(userSaltStr),
        "sub",
        jwt?.sub ?? "",
        Array.isArray(jwt?.aud) ? jwt.aud[0] : jwt?.aud ?? ""
      ).toString();

      console.log("Address seed for signature:", addressSeed);
      console.log("JWT sub:", jwt?.sub);
      console.log("JWT aud:", jwt?.aud);

      const zkLoginSignature = getZkLoginSignature({
        inputs: {
          proofPoints: zkProof.proofPoints,
          issBase64Details: zkProof.issBase64Details,
          headerBase64: zkProof.headerBase64,
          addressSeed: addressSeed,
        },
        maxEpoch: maxEpoch!,
        userSignature,
      });

      await provider.executeTransactionBlock({
        transactionBlock: bytes,
        signature: zkLoginSignature,
      });

      setResults((prev) => {
        const newResults = [...prev];
        newResults[4] = `✅ Transaction signed with zkLogin!\n\nUser Signature: ${userSignature}\nZkLogin Signature: ${zkLoginSignature}\nTransaction Bytes: ${bytes}\n${balanceInfo}`;
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
      <h1 className="text-3xl font-bold mb-6 text-center">Sui zkLogin Demo</h1>

      <div className="space-y-6">
        {/* Step 1 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Step 1: {STEPS[0]}</span>
              <Button onClick={() => runStep(0)} disabled={loading[0]}>
                {loading[0] ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  "Run Step 1"
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading[0] && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-600">
                  Generating ephemeral key pair and nonce...
                </span>
              </div>
            )}
            {results[0] && !loading[0] && (
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
              <Button onClick={() => runStep(1)} disabled={loading[1]}>
                {loading[1] ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  "Google OAuth Login"
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading[1] && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-600">
                  Redirecting to Google OAuth...
                </span>
              </div>
            )}
            {results[1] && !loading[1] && (
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
                <Input
                  id="password-inbox"
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  disabled={loading[2]}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={loading[2]}
                >
                  {showPassword ? "Hide" : "Show"}
                </Button>
              </div>
              <Button onClick={() => runStep(2)} disabled={loading[2]}>
                {loading[2] ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Run Step 3"
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading[2] && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-600">
                  Generating salt and deriving address...
                </span>
              </div>
            )}
            {results[2] && !loading[2] && (
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
              <Button onClick={() => runStep(3)} disabled={loading[3]}>
                {loading[3] ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Proof...
                  </>
                ) : (
                  "Run Step 4"
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading[3] && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-600">
                  Generating zero-knowledge proof...
                </span>
              </div>
            )}
            {results[3] && !loading[3] && (
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
              <Button onClick={() => runStep(4)} disabled={loading[4]}>
                {loading[4] ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing...
                  </>
                ) : (
                  "Run Step 5"
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading[4] && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <span className="ml-2 text-gray-600">
                  Signing transaction with zkLogin...
                </span>
              </div>
            )}
            {results[4] && !loading[4] && (
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
