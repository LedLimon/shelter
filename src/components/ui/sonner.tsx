"use client";

import {
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/*
 * Toasts are paper slips in a toner frame. Sonner's own look is switched off
 * (`unstyled`), so they follow the palette and the theme class by themselves.
 * The state is carried by an icon and the words, the ink colours the icon only.
 * Sonner's injected CSS is unlayered and sets `outline: none`, hence the
 * important focus outline.
 */
const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      containerAriaLabel="Уведомления"
      icons={{
        success: (
          <CircleCheckIcon aria-hidden className="size-5 text-success" />
        ),
        info: <InfoIcon aria-hidden className="size-5 text-info" />,
        warning: (
          <TriangleAlertIcon aria-hidden className="size-5 text-warning" />
        ),
        error: <CircleXIcon aria-hidden className="size-5 text-danger" />,
        loading: <Spinner aria-hidden className="size-5" />,
      }}
      toastOptions={{
        unstyled: true,
        ...toastOptions,
        classNames: {
          toast: cn(
            "flex w-(--width) items-start gap-3 border border-foreground bg-popover p-4 font-body text-popover-foreground shadow-sheet",
            "focus-visible:outline-3! focus-visible:outline-offset-2! focus-visible:outline-ring! focus-visible:outline-solid!",
          ),
          icon: "mt-0.5 flex shrink-0",
          content: "flex min-w-0 flex-1 flex-col gap-1",
          title: "text-body font-bold",
          description: "text-caption text-muted-foreground",
          actionButton: cn(
            buttonVariants({ size: "sm" }),
            "ml-auto self-center",
          ),
          cancelButton: cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "self-center",
          ),
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
