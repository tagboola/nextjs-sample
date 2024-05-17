export interface Message {
  id: string;
  value?: string;
  role: "user" | "model";
}
