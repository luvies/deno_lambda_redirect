import { APIGatewayProxyHandler } from "https://deno.land/x/lambda/types.d.ts";

export const handler: APIGatewayProxyHandler = async () => {
  const location = Deno.env.get("REDIRECT_URI");

  if (location) {
    return {
      statusCode: 302,
      headers: {
        location,
      },
      body: "",
    };
  } else {
    return {
      statusCode: 500,
      body: "Location not set",
    };
  }
};
