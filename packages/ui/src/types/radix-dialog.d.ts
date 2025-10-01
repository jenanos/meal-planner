declare module "@radix-ui/react-dialog" {
  // Minimal types to satisfy TS during development; real types come from package.
  import * as React from "react";
  export const Root: React.FC<any>;
  export const Trigger: React.FC<any>;
  export const Portal: React.FC<any>;
  export const Overlay: React.ForwardRefExoticComponent<any>;
  export const Content: React.ForwardRefExoticComponent<any>;
  export const Title: React.ForwardRefExoticComponent<any>;
  export const Description: React.ForwardRefExoticComponent<any>;
  export const Close: React.FC<any>;
}
