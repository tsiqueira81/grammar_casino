import { dispatchServerlessApi } from "../../server";

export const onRequest = async (context: {
  request: Request;
  env: Record<string, any>;
}) => {
  const clientIp =
    context.request.headers.get("cf-connecting-ip") ||
    context.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1";
  return await dispatchServerlessApi(context.request, clientIp, context.env);
};
