import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  if (!state) {
    return NextResponse.json({ error: "Missing state" }, { status: 400 });
  }

  try {
    // Parse the state to get the nonce
    const stateData = JSON.parse(Buffer.from(state, "base64").toString());
    const { nonce } = stateData;

    const tokenRes = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.BASE_URL}/api/oauth2callback`,
      grant_type: "authorization_code",
    });

    const { id_token } = tokenRes.data;
    const payload = JSON.parse(
      Buffer.from(id_token.split(".")[1], "base64").toString()
    );

    // Add the nonce to the response
    const response = {
      ...payload,
      nonce,
    };

    // Redirect back to the main page with the JWT data
    const redirectUrl = new URL("/", process.env.BASE_URL);
    redirectUrl.searchParams.set("jwt", JSON.stringify(response));

    return NextResponse.redirect(redirectUrl.toString());
  } catch (error: any) {
    console.error("OAuth Error:", error.response?.data || error.message);
    return NextResponse.json(
      {
        error: "OAuth failed",
        details: error.response?.data || error.message,
      },
      { status: 500 }
    );
  }
}
