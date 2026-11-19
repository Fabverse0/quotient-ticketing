import { api } from "./client";

export type Role = "buyer" | "organizer";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthResult {
  token: string;
  user: User;
}

export const login = (body: { email: string; password: string }) =>
  api<AuthResult>("/auth/login", { method: "POST", body });

export const register = (body: { email: string; password: string; name: string }) =>
  api<AuthResult>("/auth/register", { method: "POST", body });

export const fetchMe = () => api<User>("/auth/me");
