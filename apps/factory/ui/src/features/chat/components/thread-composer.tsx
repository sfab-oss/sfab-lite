import { ArrowUpIcon, PlusIcon, SquareIcon, TerminalIcon } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MOCK_COMMANDS, type MockCommand } from "../lib/mock-threads";

interface TriggerState {
  mode: "command";
  query: string;
  start: number;
}

const TRIGGER_PATTERN = /(?:^|\s)(\/)(\S*)$/;

function detectTrigger(text: string, cursor: number): TriggerState | null {
  const before = text.slice(0, cursor);
  const match = TRIGGER_PATTERN.exec(before);
  if (!match || match.index === undefined) {
    return null;
  }
  const query = match[2] ?? "";
  const start = match.index + (match[0].startsWith(" ") ? 1 : 0);
  return { mode: "command", query, start };
}

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
}: {
  onStop: () => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
  running: boolean;
}) {
  const isMobile = useIsMobile();
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trigger = useMemo(() => detectTrigger(text, cursor), [text, cursor]);

  const commandItems = useMemo(() => {
    if (!trigger) {
      return [];
    }
    const q = trigger.query.toLowerCase();
    return MOCK_COMMANDS.filter((item) =>
      item.name.toLowerCase().startsWith(q)
    );
  }, [trigger]);

  const open = trigger !== null && commandItems.length > 0;

  const stripTrigger = useCallback(
    (state: TriggerState) => {
      const end = state.start + 1 + state.query.length;
      const next = `${text.slice(0, state.start)}${text.slice(end)}`.replace(
        /\s{2,}/g,
        " "
      );
      setText(next);
      const nextCursor = state.start;
      setCursor(nextCursor);
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) {
          return;
        }
        node.focus();
        node.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [text]
  );

  const applyCommand = useCallback(
    (command: MockCommand, fromTrigger?: TriggerState) => {
      if (fromTrigger) {
        stripTrigger(fromTrigger);
      }
      if (command.id === "clear") {
        setText("");
        setCursor(0);
        return;
      }
      if (command.id === "help") {
        const help = MOCK_COMMANDS.map(
          (item) => `/${item.name} — ${item.description}`
        ).join("\n");
        onSubmit(`Help\n${help}`);
      }
    },
    [onSubmit, stripTrigger]
  );

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    onSubmit(trimmed);
    setText("");
    setCursor(0);
  }, [onSubmit, text]);

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (open) {
        return;
      }
      submit();
    },
    [open, submit]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        if (trigger) {
          stripTrigger(trigger);
        }
        return;
      }
      if (open && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (commandItems[0]) {
          applyCommand(commandItems[0], trigger ?? undefined);
        }
        return;
      }
      if (!shouldSubmitOnEnter(event, { isComposing, isMobile })) {
        return;
      }
      event.preventDefault();
      submit();
    },
    [
      applyCommand,
      commandItems,
      isComposing,
      isMobile,
      open,
      stripTrigger,
      submit,
      trigger,
    ]
  );

  return (
    <div className="w-full bg-background pt-2">
      <div className="mx-auto w-full p-2 md:max-w-3xl md:px-4 md:pb-4">
        <Popover open={open}>
          <PopoverTrigger
            className="sr-only"
            render={<button type="button" />}
            tabIndex={-1}
          />
          <form onSubmit={handleFormSubmit}>
            <InputGroup className="rounded-2xl">
              <InputGroupTextarea
                className="field-sizing-content max-h-48 min-h-16"
                onChange={(event) => {
                  setText(event.currentTarget.value);
                  setCursor(event.currentTarget.selectionStart);
                }}
                onCompositionEnd={() => setIsComposing(false)}
                onCompositionStart={() => setIsComposing(true)}
                onKeyDown={handleKeyDown}
                onSelect={(event) =>
                  setCursor(event.currentTarget.selectionStart)
                }
                placeholder={placeholder}
                ref={textareaRef}
                value={text}
              />
              <InputGroupAddon align="block-end" className="pt-1">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <InputGroupButton
                        aria-label="Run a command"
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <PlusIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-48"
                    side="top"
                  >
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <TerminalIcon />
                        Commands
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-52">
                        {MOCK_COMMANDS.map((command) => (
                          <DropdownMenuItem
                            key={command.id}
                            onClick={() => applyCommand(command)}
                          >
                            <TerminalIcon />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">
                                /{command.name}
                              </span>
                              <span className="block truncate text-muted-foreground text-xs">
                                {command.description}
                              </span>
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
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
          <PopoverContent
            align="start"
            className="w-[min(20rem,calc(100vw-2rem))] gap-0 p-1"
            side="top"
          >
            {commandItems.map((item, index) => (
              <button
                className={cn(
                  "flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-accent",
                  index === 0 && "bg-accent/60"
                )}
                key={item.id}
                onClick={() => applyCommand(item, trigger ?? undefined)}
                type="button"
              >
                <span className="font-medium text-sm">/{item.name}</span>
                <span className="text-muted-foreground text-xs">
                  {item.description}
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
