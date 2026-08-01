"use client"

import * as React from "react"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { NavSecondary } from "@/components/nav-secondary"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { parsePrRef } from "@/lib/pr"
import type { ReviewVerdict } from "@/lib/review"
import { removeSession, useReviewSessions } from "@/lib/sessions"
import { cn } from "@/lib/utils"
import {
  ArrowSquareOutIcon,
  BookOpenIcon,
  ChartLineIcon,
  DotsThreeOutlineIcon,
  GitPullRequestIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@phosphor-icons/react"

const verdictDot: Record<ReviewVerdict, { className: string; label: string }> = {
  approve: { className: "bg-emerald-500", label: "Approved" },
  comment: { className: "bg-sky-500", label: "Commented" },
  request_changes: { className: "bg-red-500", label: "Changes requested" },
}

const navSecondary = [
  {
    title: "Dashboard demo",
    url: "/dashboard",
    icon: <ChartLineIcon />,
  },
  {
    title: "Flue docs",
    url: "https://flueframework.com",
    icon: <BookOpenIcon />,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const sessions = useReviewSessions()
  const params = useParams<{ id?: string }>()
  const router = useRouter()
  const { isMobile } = useSidebar()
  const activeId = params?.id

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/" />}
            >
              <GitPullRequestIcon className="size-5! text-primary" />
              <span className="text-base font-semibold">PR Reviewer</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                  render={<Link href="/" />}
                >
                  <PlusCircleIcon />
                  <span>New review</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recent reviews</SidebarGroupLabel>
          <SidebarMenu>
            {sessions.length === 0 && (
              <p className="px-2 py-1.5 text-muted-foreground text-xs">
                No reviews yet. Paste a PR link to start one.
              </p>
            )}
            {sessions.map((session) => {
              const ref = parsePrRef(session.pr)
              const githubUrl = ref
                ? `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`
                : null
              return (
                <SidebarMenuItem key={session.id}>
                  <SidebarMenuButton
                    isActive={session.id === activeId}
                    render={<Link href={`/review/${session.id}`} />}
                    title={session.prTitle ?? session.title}
                  >
                    <GitPullRequestIcon />
                    <span className="truncate">
                      {session.prTitle ?? session.title}
                    </span>
                    {session.verdict && (
                      <span
                        aria-label={verdictDot[session.verdict].label}
                        className={cn(
                          "ml-auto size-1.5 shrink-0 rounded-full",
                          verdictDot[session.verdict].className,
                        )}
                        role="img"
                        title={verdictDot[session.verdict].label}
                      />
                    )}
                  </SidebarMenuButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <SidebarMenuAction
                          showOnHover
                          className="aria-expanded:bg-muted"
                        />
                      }
                    >
                      <DotsThreeOutlineIcon />
                      <span className="sr-only">More</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-44"
                      side={isMobile ? "bottom" : "right"}
                      align={isMobile ? "end" : "start"}
                    >
                      <DropdownMenuItem
                        render={<Link href={`/review/${session.id}`} />}
                      >
                        <GitPullRequestIcon />
                        <span>Open</span>
                      </DropdownMenuItem>
                      {githubUrl && (
                        <DropdownMenuItem
                          render={
                            <a
                              href={githubUrl}
                              rel="noreferrer"
                              target="_blank"
                            />
                          }
                        >
                          <ArrowSquareOutIcon />
                          <span>Open on GitHub</span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          removeSession(session.id)
                          if (session.id === activeId) router.push("/")
                        }}
                      >
                        <TrashIcon />
                        <span>Remove</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  )
}
