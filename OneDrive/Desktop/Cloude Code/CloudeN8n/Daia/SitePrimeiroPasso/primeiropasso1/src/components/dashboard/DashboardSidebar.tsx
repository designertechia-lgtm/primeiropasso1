import { Link } from "react-router-dom";
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import {
  Home,
  BookOpen,
  Calendar,
  Users,
  Settings,
  CreditCard,
  Share2,
} from "lucide-react";

const menuItems = [
  { label: "Dashboard", href: "/admin", icon: Home },
  { label: "Contas Conectadas", href: "/admin/contas-conectadas", icon: Share2 },
  { label: "Agenda", href: "/admin/agenda", icon: Calendar },
  { label: "Assinatura", href: "/admin/assinatura", icon: CreditCard },
  { label: "Vídeos", href: "/admin/videos", icon: BookOpen },
  { label: "Configurações", href: "/admin/configuracoes", icon: Settings },
];

export function DashboardSidebar() {
  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">Admin</h2>
      </div>
      <SidebarContent className="flex-1">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild>
                    <Link to={item.href} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent">
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </div>
  );
}
