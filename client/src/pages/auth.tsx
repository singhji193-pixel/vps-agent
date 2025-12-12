import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Terminal, Mail, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const otpSchema = z.object({
  code: z.string().length(6, "Please enter the 6-digit code"),
});

type EmailForm = z.infer<typeof emailSchema>;
type OtpForm = z.infer<typeof otpSchema>;

interface AuthPageProps {
  onAuthenticated: () => void;
}

function CustomOTPInput({ 
  value, 
  onChange 
}: { 
  value: string; 
  onChange: (val: string) => void;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, '').split('').slice(0, 6);

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newDigits = [...digits];
      if (newDigits[index]) {
        newDigits[index] = '';
      } else if (index > 0) {
        newDigits[index - 1] = '';
        inputRefs.current[index - 1]?.focus();
      }
      onChange(newDigits.join(''));
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleInput = (index: number, e: React.FormEvent<HTMLInputElement>) => {
    const inputValue = e.currentTarget.value;
    const digit = inputValue.replace(/[^0-9]/g, '').slice(-1);
    
    if (digit) {
      const newDigits = [...digits];
      newDigits[index] = digit;
      onChange(newDigits.join(''));
      
      if (index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (pastedData) {
      onChange(pastedData);
      const focusIndex = Math.min(pastedData.length, 5);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <div className="flex items-center gap-2" data-testid="input-otp">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[index] || ''}
          onChange={() => {}}
          onInput={(e) => handleInput(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={handleFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore="true"
          className="w-10 h-12 text-center text-lg font-semibold border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          data-testid={`input-otp-slot-${index}`}
        />
      ))}
    </div>
  );
}

export default function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [otpValue, setOtpValue] = useState("");
  const { toast } = useToast();

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const otpForm = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });

  const sendOtpMutation = useMutation({
    mutationFn: async (data: EmailForm) => {
      const response = await apiRequest("POST", "/api/auth/send-otp", data);
      return response;
    },
    onSuccess: () => {
      setEmail(emailForm.getValues("email"));
      setOtpValue("");
      otpForm.reset({ code: "" });
      setStep("otp");
      setCountdown(60);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      toast({
        title: "Code sent!",
        description: "Check your email for the verification code.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send verification code",
        variant: "destructive",
      });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (data: OtpForm) => {
      const response = await apiRequest("POST", "/api/auth/verify-otp", {
        email,
        code: data.code,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/status"] });
      toast({
        title: "Welcome!",
        description: "You've been successfully authenticated.",
      });
      onAuthenticated();
    },
    onError: (error: Error) => {
      toast({
        title: "Invalid code",
        description: error.message || "The code you entered is incorrect or expired.",
        variant: "destructive",
      });
    },
  });

  const onEmailSubmit = (data: EmailForm) => {
    sendOtpMutation.mutate(data);
  };

  const onOtpSubmit = () => {
    if (otpValue.length === 6) {
      verifyOtpMutation.mutate({ code: otpValue });
    }
  };

  const resendCode = () => {
    if (countdown > 0) return;
    sendOtpMutation.mutate({ email });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary mb-4">
            <Terminal className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold">VPS Agent</h1>
          <p className="text-muted-foreground text-sm mt-1">AI-Powered Server Management</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-lg">
              {step === "email" ? "Sign in to your account" : "Enter verification code"}
            </CardTitle>
            <CardDescription>
              {step === "email"
                ? "We'll send you a verification code via email"
                : `We sent a 6-digit code to ${email}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "email" ? (
              <Form {...emailForm}>
                <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                  <FormField
                    control={emailForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email address</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              {...field}
                              type="email"
                              placeholder="you@example.com"
                              className="pl-10"
                              data-testid="input-email"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={sendOtpMutation.isPending}
                    data-testid="button-send-code"
                  >
                    {sendOtpMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); onOtpSubmit(); }} className="space-y-6">
                <div className="flex flex-col items-center">
                  <CustomOTPInput 
                    value={otpValue} 
                    onChange={(val) => {
                      setOtpValue(val);
                      otpForm.setValue("code", val);
                    }} 
                  />
                  {otpValue.length > 0 && otpValue.length < 6 && (
                    <p className="text-sm text-muted-foreground mt-2">Enter all 6 digits</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={verifyOtpMutation.isPending || otpValue.length !== 6}
                  data-testid="button-verify-code"
                >
                  {verifyOtpMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify & Sign In"
                  )}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={resendCode}
                    disabled={countdown > 0}
                    className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                    data-testid="button-resend-code"
                  >
                    {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setOtpValue("");
                  }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
                  data-testid="button-change-email"
                >
                  Use a different email
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
