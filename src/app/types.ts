export interface JwtPayload {
  iss?: string;
  sub?: string; //Subject ID
  aud?: string[] | string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
}

export interface Step1Data {
  maxEpoch: number;
  publicKey: string;
  privateKey: string;
  randomness: string;
  nonce: string;
  validityEndTime: number;
  validityDuration: number;
}
