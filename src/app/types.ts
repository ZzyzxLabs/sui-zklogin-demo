export interface JwtPayload {
  iss?: string;
  sub?: string; //Subject ID
  aud?: string[] | string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
}

export interface Ed25519KeypairData {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface Step1Data {
  maxEpoch: number;
  keypairData: Ed25519KeypairData;
  randomness: string;
  nonce: string;
  validityEndTime: number;
  validityDuration: number;
}
