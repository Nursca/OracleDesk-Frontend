import type { ButtonHTMLAttributes, DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "wui-card": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        elevation?: string;
        outlined?: boolean;
      };
      "wui-button": DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> & {
        variant?: string;
        color?: string;
        size?: string;
      };
      "wui-connect-button": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        label?: string;
      };
    }
  }
}

export {};
