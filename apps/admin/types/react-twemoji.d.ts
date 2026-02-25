declare module "react-twemoji" {
  import * as React from "react";
  export interface TwemojiProps {
    children?: React.ReactNode;
    className?: string;
    options?: {
      className?: string;
      folder?: "svg" | "png";
      ext?: ".svg" | ".png";
      base?: string;
      size?: string | number;
    };
  }
  const Twemoji: React.FC<TwemojiProps>;
  export default Twemoji;
}
