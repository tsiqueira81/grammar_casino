import { dispatchServerlessApi } from "../../server";

export default async (req: Request, context: { ip?: string }) => {
  return await dispatchServerlessApi(req, context?.ip || "127.0.0.1");
};

export const config = {
  path: ["/api/gemini", "/api/teacher-auth/*", "/api/health"],
};
