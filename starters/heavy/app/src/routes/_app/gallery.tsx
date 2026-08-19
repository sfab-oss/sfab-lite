import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ShellPageFrame } from "../../components/layout/shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { AspectRatio } from "../../components/ui/aspect-ratio";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "../../components/ui/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "../../components/ui/combobox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { DirectionProvider, useDirection } from "../../components/ui/direction";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../../components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../components/ui/empty";
import { EmptyState } from "../../components/ui/empty-state";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../../components/ui/field";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../components/ui/hover-card";
import { Input } from "../../components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../../components/ui/input-group";
import { InputOTP, InputOTPInput } from "../../components/ui/input-otp";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "../../components/ui/item";
import { Kbd, KbdGroup } from "../../components/ui/kbd";
import { Label } from "../../components/ui/label";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "../../components/ui/menubar";
import {
  NativeSelect,
  NativeSelectOption,
} from "../../components/ui/native-select";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "../../components/ui/navigation-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import { Progress, ProgressValue } from "../../components/ui/progress";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Separator } from "../../components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "../../components/ui/sidebar";
import { Skeleton } from "../../components/ui/skeleton";
import { Slider } from "../../components/ui/slider";
import { Spinner } from "../../components/ui/spinner";
import { Switch } from "../../components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import { ToastProvider, ToastViewport } from "../../components/ui/toast";
import { Toggle } from "../../components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { useIsMobile } from "../../hooks/use-mobile";
import { cn } from "../../lib/utils";

export const Route = createFileRoute("/_app/gallery")({
  component: GalleryPage,
});

const COMBO_ITEMS = ["Alpha", "Beta", "Gamma"] as const;

function DirectionProbe() {
  const direction = useDirection();
  return <span className="text-muted-foreground text-xs">dir={direction}</span>;
}

function GallerySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium text-sm">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function GalleryPage() {
  const mobile = useIsMobile();
  const mobileClass = cn(
    "text-xs",
    mobile ? "text-primary" : "text-muted-foreground"
  );

  return (
    <ShellPageFrame>
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="space-y-1">
          <h2 className="font-semibold text-2xl tracking-tight">Gallery</h2>
          <p className="text-muted-foreground text-sm">
            Every live catalog recipe, imported as a client root. Ugly is fine.
          </p>
          <p className={mobileClass}>useIsMobile={String(mobile)} · cn wired</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <GallerySection title="accordion">
            <Accordion>
              <AccordionItem value="one">
                <AccordionTrigger>Item</AccordionTrigger>
                <AccordionContent>Body</AccordionContent>
              </AccordionItem>
            </Accordion>
          </GallerySection>

          <GallerySection title="alert">
            <Alert>
              <AlertTitle>Alert</AlertTitle>
              <AlertDescription>Description</AlertDescription>
            </Alert>
          </GallerySection>

          <GallerySection title="alert-dialog">
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="outline" />}>
                Open
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm</AlertDialogTitle>
                  <AlertDialogDescription>Sure?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction>OK</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </GallerySection>

          <GallerySection title="aspect-ratio">
            <AspectRatio className="rounded-md bg-muted" ratio={16 / 9} />
          </GallerySection>

          <GallerySection title="avatar">
            <Avatar>
              <AvatarFallback>HV</AvatarFallback>
            </Avatar>
          </GallerySection>

          <GallerySection title="badge">
            <Badge>Heavy</Badge>
          </GallerySection>

          <GallerySection title="breadcrumb">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/overview">Home</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Gallery</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </GallerySection>

          <GallerySection title="button / button-group">
            <ButtonGroup>
              <Button size="sm">One</Button>
              <ButtonGroupSeparator />
              <Button size="sm" variant="outline">
                Two
              </Button>
            </ButtonGroup>
          </GallerySection>

          <GallerySection title="card">
            <Card>
              <CardHeader>
                <CardTitle>Card</CardTitle>
                <CardDescription>Description</CardDescription>
              </CardHeader>
              <CardContent>Content</CardContent>
            </Card>
          </GallerySection>

          <GallerySection title="checkbox">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox />
              <span>Check me</span>
            </div>
          </GallerySection>

          <GallerySection title="collapsible">
            <Collapsible>
              <CollapsibleTrigger
                render={<Button size="sm" variant="outline" />}
              >
                Toggle
              </CollapsibleTrigger>
              <CollapsibleContent>Hidden until open</CollapsibleContent>
            </Collapsible>
          </GallerySection>

          <GallerySection title="combobox">
            <Combobox items={[...COMBO_ITEMS]}>
              <ComboboxInput placeholder="Pick" />
              <ComboboxContent>
                <ComboboxEmpty>None</ComboboxEmpty>
                <ComboboxList>
                  {(item: string) => (
                    <ComboboxItem key={item} value={item}>
                      {item}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </GallerySection>

          <GallerySection title="context-menu">
            <ContextMenu>
              <ContextMenuTrigger className="rounded border border-dashed p-4 text-sm">
                Right-click
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem>Action</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </GallerySection>

          <GallerySection title="dialog">
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>
                Dialog
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Title</DialogTitle>
                  <DialogDescription>Body</DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </GallerySection>

          <GallerySection title="direction">
            <DirectionProvider direction="ltr">
              <DirectionProbe />
            </DirectionProvider>
          </GallerySection>

          <GallerySection title="drawer">
            <Drawer>
              <DrawerTrigger render={<Button variant="outline" />}>
                Drawer
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Drawer</DrawerTitle>
                  <DrawerDescription>Panel</DrawerDescription>
                </DrawerHeader>
                <DrawerFooter>
                  <DrawerClose render={<Button />}>Close</DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </GallerySection>

          <GallerySection title="dropdown-menu">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                Menu
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Item</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </GallerySection>

          <GallerySection title="empty / empty-state">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Empty</EmptyTitle>
                <EmptyDescription>Nothing here</EmptyDescription>
              </EmptyHeader>
            </Empty>
            <EmptyState description="Also empty" title="EmptyState" />
          </GallerySection>

          <GallerySection title="field / input / label / textarea">
            <FieldGroup>
              <Field>
                <FieldLabel>
                  <Label htmlFor="gallery-input">Name</Label>
                </FieldLabel>
                <Input id="gallery-input" placeholder="Value" />
                <FieldDescription>Hint</FieldDescription>
              </Field>
              <Textarea placeholder="Notes" />
            </FieldGroup>
          </GallerySection>

          <GallerySection title="hover-card">
            <HoverCard>
              <HoverCardTrigger render={<Button variant="link" />}>
                Hover
              </HoverCardTrigger>
              <HoverCardContent>Peek</HoverCardContent>
            </HoverCard>
          </GallerySection>

          <GallerySection title="input-group">
            <InputGroup>
              <InputGroupAddon>@</InputGroupAddon>
              <InputGroupInput placeholder="handle" />
            </InputGroup>
          </GallerySection>

          <GallerySection title="input-otp">
            <InputOTP length={4}>
              <InputOTPInput />
              <InputOTPInput />
              <InputOTPInput />
              <InputOTPInput />
            </InputOTP>
          </GallerySection>

          <GallerySection title="item">
            <Item>
              <ItemContent>
                <ItemTitle>Item</ItemTitle>
                <ItemDescription>Row</ItemDescription>
              </ItemContent>
            </Item>
          </GallerySection>

          <GallerySection title="kbd">
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </GallerySection>

          <GallerySection title="menubar">
            <Menubar>
              <MenubarMenu>
                <MenubarTrigger>File</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem>New</MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          </GallerySection>

          <GallerySection title="native-select">
            <NativeSelect>
              <NativeSelectOption value="a">A</NativeSelectOption>
              <NativeSelectOption value="b">B</NativeSelectOption>
            </NativeSelect>
          </GallerySection>

          <GallerySection title="navigation-menu">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink href="/overview">
                    Overview
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </GallerySection>

          <GallerySection title="pagination">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive>
                    1
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext href="#" />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </GallerySection>

          <GallerySection title="popover">
            <Popover>
              <PopoverTrigger render={<Button variant="outline" />}>
                Popover
              </PopoverTrigger>
              <PopoverContent>Content</PopoverContent>
            </Popover>
          </GallerySection>

          <GallerySection title="progress">
            <Progress value={40}>
              <ProgressValue />
            </Progress>
          </GallerySection>

          <GallerySection title="radio-group">
            <RadioGroup defaultValue="a">
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="a" />
                <span>A</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="b" />
                <span>B</span>
              </div>
            </RadioGroup>
          </GallerySection>

          <GallerySection title="scroll-area">
            <ScrollArea className="h-24 rounded border p-2">
              <div className="space-y-2 text-sm">
                <p>Line 1</p>
                <p>Line 2</p>
                <p>Line 3</p>
                <p>Line 4</p>
                <p>Line 5</p>
              </div>
            </ScrollArea>
          </GallerySection>

          <GallerySection title="select">
            <Select defaultValue="a">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a">A</SelectItem>
                <SelectItem value="b">B</SelectItem>
              </SelectContent>
            </Select>
          </GallerySection>

          <GallerySection title="separator">
            <Separator />
          </GallerySection>

          <GallerySection title="sheet">
            <Sheet>
              <SheetTrigger render={<Button variant="outline" />}>
                Sheet
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Sheet</SheetTitle>
                </SheetHeader>
              </SheetContent>
            </Sheet>
          </GallerySection>

          <GallerySection title="sidebar">
            <SidebarProvider className="min-h-[12rem] rounded border">
              <Sidebar collapsible="none" variant="inset">
                <SidebarHeader>Demo</SidebarHeader>
                <SidebarContent>
                  <SidebarGroup>
                    <SidebarGroupLabel>Nav</SidebarGroupLabel>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton>Item</SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroup>
                </SidebarContent>
              </Sidebar>
            </SidebarProvider>
          </GallerySection>

          <GallerySection title="skeleton / spinner">
            <Skeleton className="h-8 w-40" />
            <Spinner />
          </GallerySection>

          <GallerySection title="slider">
            <Slider defaultValue={[30]} />
          </GallerySection>

          <GallerySection title="switch">
            <Switch />
          </GallerySection>

          <GallerySection title="table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Col</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Cell</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </GallerySection>

          <GallerySection title="tabs">
            <Tabs defaultValue="one">
              <TabsList>
                <TabsTrigger value="one">One</TabsTrigger>
                <TabsTrigger value="two">Two</TabsTrigger>
              </TabsList>
              <TabsContent value="one">First</TabsContent>
              <TabsContent value="two">Second</TabsContent>
            </Tabs>
          </GallerySection>

          <GallerySection title="toast">
            <ToastProvider>
              <span className="text-muted-foreground text-xs">
                ToastProvider mounted
              </span>
              <ToastViewport />
            </ToastProvider>
          </GallerySection>

          <GallerySection title="toggle / toggle-group">
            <Toggle>Bold</Toggle>
            <ToggleGroup>
              <ToggleGroupItem value="a">A</ToggleGroupItem>
              <ToggleGroupItem value="b">B</ToggleGroupItem>
            </ToggleGroup>
          </GallerySection>

          <GallerySection title="tooltip">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" />}>
                  Tip
                </TooltipTrigger>
                <TooltipContent>Hello</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </GallerySection>
        </div>
      </div>
    </ShellPageFrame>
  );
}
