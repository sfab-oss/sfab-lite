import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { type Theme, useTheme } from "../lib/theme";
import { Button } from "./ui/button";

const CYCLE: Theme[] = ["system", "light", "dark"];

function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedDark } = useTheme();

  function onClick() {
    const index = CYCLE.indexOf(theme);
    setTheme(CYCLE[(index + 1) % CYCLE.length] ?? "system");
  }

  return (
    <Button
      aria-label={`Theme: ${theme}`}
      className={className}
      onClick={onClick}
      size="icon"
      title={`Theme: ${theme}`}
      type="button"
      variant="ghost"
    >
      {resolvedDark ? (
        <MoonIcon className="size-4" />
      ) : (
        <SunIcon className="size-4" />
      )}
    </Button>
  );
}

export { ThemeToggle };
