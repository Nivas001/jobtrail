import Link from "next/link";
import { getUser } from "@/lib/data";
import { HelperStatus } from "@/components/helper-status";
import { Logo } from "@/components/logo";
import { MobileNav } from "@/components/mobile-nav";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserMenu } from "@/components/user-menu";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
        <Link href="/" className="mb-6 px-2">
          <Logo />
        </Link>
        <SidebarNav />
        <div className="mt-auto space-y-2">
          <HelperStatus />
          <UserMenu name={user.name} login={user.login} avatar={user.avatar} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/80 px-3 py-2 backdrop-blur md:hidden">
          <MobileNav />
          <Logo />
          <HelperStatus compact />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
