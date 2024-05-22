import Icon from "@mui/material/Icon";
import { Message } from "../types";
import Person2OutlinedIcon from "@mui/icons-material/Person2Outlined";

export interface UserChatMessage {
  message: Message;
}
export function UserChatMessage({ message }: UserChatMessage) {
  return (
    <div className="chat-message-container">
      <div className="chat-message-icon-container">
        <Person2OutlinedIcon fontSize="large"></Person2OutlinedIcon>
      </div>
      <div className="chat-message-content-container">{message.value}</div>
    </div>
  );
}
