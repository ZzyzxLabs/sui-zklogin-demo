import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { generateRandomness, generateNonce } from '@mysten/sui/zklogin'

export const generateRandomnessAndNonce = async () => {
    const ephemeralKeyPair = new Ed25519Keypair()
    const randomness = generateRandomness()
    const maxEpoch = 12345 // Replace with actual
    const nonce = generateNonce(ephemeralKeyPair.getPublicKey(), maxEpoch, randomness)
    return `Randomness: ${randomness}\nNonce: ${nonce}`
} 