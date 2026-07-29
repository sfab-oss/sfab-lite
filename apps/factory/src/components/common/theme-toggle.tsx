import { Button } from "@sfab-lite/ui/components/shadcn/button";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme() as {
    theme: string | undefined;
    setTheme: (theme: string) => void;
  };

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  return (
    <Button onClick={toggleTheme} size="icon" type="button" variant="ghost">
      <SunIcon className="hidden [html.dark_&]:block" />
      <MoonIcon className="hidden [html.light_&]:block" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
