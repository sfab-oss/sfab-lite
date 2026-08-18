import { OTPField as OTPFieldPrimitive } from "@base-ui/react/otp-field";
import { cn } from "../../lib/utils";

function InputOTP({ className, ...props }: OTPFieldPrimitive.Root.Props) {
  return (
    <OTPFieldPrimitive.Root
      className={cn("flex items-center has-disabled:opacity-50", className)}
      data-slot="input-otp"
      {...props}
    />
  );
}

function InputOTPInput({ className, ...props }: OTPFieldPrimitive.Input.Props) {
  return (
    <OTPFieldPrimitive.Input
      className={cn("disabled:cursor-not-allowed", className)}
      data-slot="input-otp-input"
      {...props}
    />
  );
}

export { InputOTP, InputOTPInput };
