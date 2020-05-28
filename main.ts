import { APIGatewayProxyHandler } from "https://deno.land/x/lambda/types.d.ts";

const location = Deno.env.get("REDIRECT_URI");

export const handler: APIGatewayProxyHandler = location
  ? (async () => ({
    statusCode: 302,
    headers: {
      location,
    },
    body: "",
  }))
  : (async () => ({
    statusCode: 500,
    body: "Location not set",
  }));
