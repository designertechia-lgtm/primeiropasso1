import {
  LayoutDashboard,
  User,
  FileText,
  Video,
  Users,
  Settings,
  Clock,
  Calendar,
  CalendarDays,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Painel", url: "/admin", icon: LayoutDashboard },
  { title: "Meu Perfil", url: "/admin/perfil", icon: User },
  { title: "Artigos", url: "/admin/artigos", icon: FileText },
  { title: "Vídeos", url: "/admin/videos", icon: Video },
  { title: "Novos Pacientes", url: "/admin/leads", icon: Users },
  { title: "Disponibilidade", url: "/admin/disponibilidade", icon: Clock },
  { title: "Agendamentos", url: "/admin/agendamentos", icon: Calendar },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
];

export function DashboardSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const isActive = (path: string) =>
    path === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(path);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && "Primeiro Passo"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/admin"}
                      className="hover:bg-muted/50"
                      activeClassName="bg-muted text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
