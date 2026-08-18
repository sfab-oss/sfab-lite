import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { cn } from "../../lib/utils";

const ToastProvider = ToastPrimitive.Provider;
const useToastManager = ToastPrimitive.useToastManager;

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        className={cn(
          "fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2 outline-none",
          className
        )}
        data-slot="toast-viewport"
        {...props}
      />
    </ToastPrimitive.Portal>
  );
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-3 text-card-foreground text-sm shadow-md",
        className
      )}
      data-slot="toast"
      {...props}
    />
  );
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      className={cn("flex flex-col gap-0.5", className)}
      data-slot="toast-content"
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      className={cn("font-medium", className)}
      data-slot="toast-title"
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      className={cn("text-muted-foreground", className)}
      data-slot="toast-description"
      {...props}
    />
  );
}

function ToastClose({ className, ...props }: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      className={cn(
        "absolute top-2 right-2 text-muted-foreground text-xs",
        className
      )}
      data-slot="toast-close"
      {...props}
    />
  );
}

export {
  Toast,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager,
};
