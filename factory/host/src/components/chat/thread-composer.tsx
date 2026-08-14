import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@sfab-lite/ui/components/shadcn/input-group";
import { useIsMobile } from "@sfab-lite/ui/hooks/use-mobile";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { type ComposerScope, ComposerScopeChip } from "./composer-scope-chip";

function shouldSubmitOnEnter(
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
  opts: { isComposing: boolean; isMobile: boolean }
): boolean {
  if (event.key !== "Enter") {
    return false;
  }
  if (
    opts.isMobile ||
    event.shiftKey ||
    opts.isComposing ||
    event.nativeEvent.isComposing
  ) {
    return false;
  }
  return true;
}

export function ThreadComposer({
  onSubmit,
  onStop,
  placeholder = "Message the agent…",
  running,
  scope,
}: {
  onStop: () => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
  running: boolean;
  /** Omitted inside a thread — only a blank composer can still choose an app. */
  scope?: ComposerScope;
}) {
  const isMobile = useIsMobile();
  const [text, setText] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    onSubmit(trimmed);
    setText("");
  }, [onSubmit, text]);

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submit();
    },
    [submit]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (!shouldSubmitOnEnter(event, { isComposing, isMobile })) {
        return;
      }
      event.preventDefault();
      submit();
    },
    [isComposing, isMobile, submit]
  );

  return (
    <div className="w-full bg-background pt-2">
      <div className="mx-auto w-full p-2 md:max-w-3xl md:px-4 md:pb-4">
        <form onSubmit={handleFormSubmit}>
          <InputGroup className="rounded-2xl">
            <InputGroupTextarea
              className="field-sizing-content max-h-48 min-h-16"
              onChange={(event) => setText(event.currentTarget.value)}
              onCompositionEnd={() => setIsComposing(false)}
              onCompositionStart={() => setIsComposing(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              ref={textareaRef}
              value={text}
            />
            <InputGroupAddon align="block-end" className="pt-1">
              {scope ? <ComposerScopeChip {...scope} /> : null}
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <InputGroupButton
                  aria-label={running ? "Stop" : "Send message"}
                  onClick={
                    running
                      ? (event) => {
                          event.preventDefault();
                          onStop();
                        }
                      : undefined
                  }
                  size="icon-sm"
                  type={running ? "button" : "submit"}
                  variant="default"
                >
                  {running ? (
                    <SquareIcon className="size-4" />
                  ) : (
                    <ArrowUpIcon className="size-4" />
                  )}
                </InputGroupButton>
              </div>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
    </div>
  );
}
