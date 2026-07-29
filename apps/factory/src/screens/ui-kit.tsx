import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@sfab-lite/ui/components/shadcn/alert";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@sfab-lite/ui/components/shadcn/attachment";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@sfab-lite/ui/components/shadcn/avatar";
import { Badge } from "@sfab-lite/ui/components/shadcn/badge";
import {
  Bubble,
  BubbleContent,
  BubbleGroup,
} from "@sfab-lite/ui/components/shadcn/bubble";
import { Button } from "@sfab-lite/ui/components/shadcn/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sfab-lite/ui/components/shadcn/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sfab-lite/ui/components/shadcn/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sfab-lite/ui/components/shadcn/dropdown-menu";
import { Input } from "@sfab-lite/ui/components/shadcn/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@sfab-lite/ui/components/shadcn/input-group";
import { Label } from "@sfab-lite/ui/components/shadcn/label";
import { Markdown } from "@sfab-lite/ui/components/shadcn/markdown";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "@sfab-lite/ui/components/shadcn/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@sfab-lite/ui/components/shadcn/message-scroller";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@sfab-lite/ui/components/shadcn/popover";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@sfab-lite/ui/components/shadcn/resizable";
import { Separator } from "@sfab-lite/ui/components/shadcn/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@sfab-lite/ui/components/shadcn/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@sfab-lite/ui/components/shadcn/sidebar";
import { Skeleton } from "@sfab-lite/ui/components/shadcn/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@sfab-lite/ui/components/shadcn/tabs";
import { Textarea } from "@sfab-lite/ui/components/shadcn/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@sfab-lite/ui/components/shadcn/tooltip";
import { AlertCircleIcon, ChevronDownIcon, PaperclipIcon } from "lucide-react";
import type { ReactNode } from "react";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-border border-b py-8">
      <h2 className="m-0 font-semibold text-base text-foreground">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function UiKitScreen() {
  return (
    <TooltipProvider>
      <main className="mx-auto max-w-3xl px-6 py-10 text-foreground">
        <p className="m-0 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Dev only
        </p>
        <h1 className="mt-1 mb-2 font-semibold text-2xl">UI kit</h1>
        <p className="mt-0 mb-0 text-muted-foreground text-sm">
          Scratch mount of every ported primitive. Not linked from console nav —
          open <code>/dev/ui</code> directly.
        </p>

        <Section title="Button / Badge / Label / Separator">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Default</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="kit-label-input">Label</Label>
            <Input
              className="max-w-xs"
              id="kit-label-input"
              placeholder="Input"
            />
          </div>
          <Separator />
        </Section>

        <Section title="Alert / Card / Skeleton / Textarea">
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>Alert</AlertTitle>
            <AlertDescription>Default alert body.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Destructive</AlertTitle>
            <AlertDescription>Something went wrong.</AlertDescription>
          </Alert>
          <Card>
            <CardHeader>
              <CardTitle>Card</CardTitle>
              <CardDescription>Card description</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea placeholder="Textarea inside a card" />
              <Skeleton className="mt-3 h-4 w-1/2" />
            </CardContent>
          </Card>
        </Section>

        <Section title="Avatar / Attachment / Bubble / Message">
          <Avatar>
            <AvatarImage alt="kit" src="" />
            <AvatarFallback>SF</AvatarFallback>
          </Avatar>
          <Attachment>
            <AttachmentMedia>
              <PaperclipIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>notes.md</AttachmentTitle>
              <AttachmentDescription>1.2 KB</AttachmentDescription>
            </AttachmentContent>
          </Attachment>
          <MessageGroup>
            <Message>
              <MessageAvatar>
                <Avatar>
                  <AvatarFallback>A</AvatarFallback>
                </Avatar>
              </MessageAvatar>
              <MessageContent>
                <MessageHeader>Assistant</MessageHeader>
                <BubbleGroup>
                  <Bubble>
                    <BubbleContent>Bubble content</BubbleContent>
                  </Bubble>
                </BubbleGroup>
              </MessageContent>
            </Message>
          </MessageGroup>
        </Section>

        <Section title="Markdown">
          <Markdown>{"**Bold** and `code` from streamdown."}</Markdown>
        </Section>

        <Section title="Input group / Collapsible / Tabs">
          <InputGroup>
            <InputGroupInput placeholder="Compose…" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton>Send</InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <Collapsible>
            <CollapsibleTrigger render={<Button variant="outline" />}>
              Collapsible <ChevronDownIcon data-icon="inline-end" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 text-sm">
              Collapsed body
            </CollapsibleContent>
          </Collapsible>
          <Tabs defaultValue="one">
            <TabsList>
              <TabsTrigger value="one">One</TabsTrigger>
              <TabsTrigger value="two">Two</TabsTrigger>
            </TabsList>
            <TabsContent value="one">Tab one</TabsContent>
            <TabsContent value="two">Tab two</TabsContent>
          </Tabs>
        </Section>

        <Section title="Dropdown / Popover / Tooltip / Sheet">
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                Menu
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Item A</DropdownMenuItem>
                <DropdownMenuItem>Item B</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover>
              <PopoverTrigger render={<Button variant="outline" />}>
                Popover
              </PopoverTrigger>
              <PopoverContent>Popover body</PopoverContent>
            </Popover>
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" />}>
                Tip
              </TooltipTrigger>
              <TooltipContent>Tooltip body</TooltipContent>
            </Tooltip>
            <Sheet>
              <SheetTrigger render={<Button variant="outline" />}>
                Sheet
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Sheet</SheetTitle>
                  <SheetDescription>Sheet description</SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>
          </div>
        </Section>

        <Section title="Resizable">
          <div className="h-32 overflow-hidden rounded-md border border-border">
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={50}>
                <div className="flex h-full items-center justify-center p-2 text-sm">
                  Left
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50}>
                <div className="flex h-full items-center justify-center p-2 text-sm">
                  Right
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </Section>

        <Section title="Message scroller">
          <div className="h-48 overflow-hidden rounded-md border border-border">
            <MessageScrollerProvider>
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent>
                    {["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map(
                      (label) => (
                        <MessageScrollerItem key={label}>
                          <p className="m-0 px-3 py-2 text-sm">{label}</p>
                        </MessageScrollerItem>
                      )
                    )}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          </div>
        </Section>

        <Section title="Sidebar">
          <div className="h-56 overflow-hidden rounded-md border border-border">
            <SidebarProvider className="h-full min-h-0!">
              <Sidebar collapsible="none" className="border-r">
                <SidebarHeader>
                  <SidebarTrigger />
                </SidebarHeader>
                <SidebarContent>
                  <SidebarGroup>
                    <SidebarGroupLabel>Kit</SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton>Item</SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                </SidebarContent>
              </Sidebar>
              <SidebarInset>
                <div className="p-4 text-sm">Sidebar inset</div>
              </SidebarInset>
            </SidebarProvider>
          </div>
        </Section>
      </main>
    </TooltipProvider>
  );
}
