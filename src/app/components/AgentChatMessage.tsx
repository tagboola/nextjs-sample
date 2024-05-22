import Stack from "@mui/material/Stack";
import { Message } from "../types";
import LinearProgress from "@mui/material/LinearProgress";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";

export interface AgentChatMessageProps {
  message: Message;
}
export function AgentChatMessage({ message }: AgentChatMessageProps) {
  function renderMessage() {
    if (message.value && message.value.length > 0) {
      return <div className="chat-message-container">{message.value}</div>;
    } else {
      return (
        <Stack sx={{ width: "100%", color: "grey.500" }} spacing={2}>
          <LinearProgress color="secondary" />
          <LinearProgress color="success" />
          <LinearProgress color="inherit" />
        </Stack>
      );
    }
  }

  return (
    <div className="chat-message-container">
      <div className="chat-message-icon-container">
        <SupportAgentIcon fontSize="large"></SupportAgentIcon>
      </div>
      <div className="chat-message-content-container">{renderMessage()}</div>
    </div>
  );
}
