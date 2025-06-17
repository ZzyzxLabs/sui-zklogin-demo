'use client'

import { useState } from 'react'

export default function ZkLoginPage() {
  const [step, setStep] = useState(0)
  const [output, setOutput] = useState<string | null>(null)

  const steps = [
    "Step 1: Generate ephemeral key pair",
    "Step 2: Generate randomness and nonce",
    "Step 3: Get JWT from OAuth provider",
    "Step 4: Decode JWT claims",
    "Step 5: Derive zkLogin address",
    "Step 6: Sign transaction with zk proof"
  ]

  const handleRunStep = async () => {
    switch (step) {
      case 0: {
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519')
        const keypair = new Ed25519Keypair()
        setOutput(`Public Key: ${keypair.getPublicKey().toBase64()}`)
        break
      }
      case 1: {
        const { generateRandomness, generateNonce } = await import('@mysten/sui/zklogin')
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519')
        const ephemeralKeyPair = new Ed25519Keypair()
        const randomness = generateRandomness()
        const maxEpoch = 12345 // Replace with actual
        const nonce = generateNonce(ephemeralKeyPair.getPublicKey(), maxEpoch, randomness)
        setOutput(`Randomness: ${randomness}\nNonce: ${nonce}`)
        break
      }
      case 2:
        setOutput('Redirect to OAuth provider to obtain a JWT token (e.g. Google Sign-In)')
        break
      case 3:
        setOutput('Use a JWT parser to extract claims: sub, iss, aud')
        break
      case 4:
        setOutput('Use claims + userSalt to deterministically derive zkLogin address')
        break
      case 5:
        setOutput('Sign transaction using zk proof + ephemeral signature')
        break
      default:
        setOutput(null)
    }

    if (step < steps.length - 1) {
      setStep(prev => prev + 1)
    }
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">zkLogin Walkthrough</h1>
      <p className="mb-2 font-medium">{steps[step]}</p>

      <button
        onClick={handleRunStep}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        {step < steps.length - 1 ? 'Run Step' : 'Done'}
      </button>

      {output && (
        <pre className="mt-4 bg-gray-100 p-3 rounded whitespace-pre-wrap text-sm">
          {output}
        </pre>
      )}
    </main>
  )
}
