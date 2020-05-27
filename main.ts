import { APIGatewayProxyHandler } from "https://deno.land/x/lambda/types.d.ts";

const location = Deno.env.get("REDIRECT_URI");

export const handler: APIGatewayProxyHandler = location
  ? (async () => {
    return {
      statusCode: 302,
      headers: {
        location,
      },
      body: "",
    };
  })
  : (async () => {
    return {
      statusCode: 500,
      body: "Location not set",
    };
  });
