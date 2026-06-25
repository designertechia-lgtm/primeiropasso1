import {
  LayoutDashboard,
  User,
  FileText,
  Video,
  LayoutList,
  Settings,
  CalendarDays,
  FileUp,
  Clapperboard,
  Monitor,
  Share2,
  Drama,
  CreditCard,
  Crown,
  MessageSquare,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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

const sections = [
  {
    label: "Geral",
    items: [
      { title: "Painel", url: "/admin", icon: LayoutDashboard },
      { title: "Meu Perfil", url: "/admin/perfil", icon: User },
      { title: "Minha Página", url: "/admin/landing", icon: Monitor },
    ]
  },
  {
    label: "Gestão",
    items: [
      { title: "Agenda", url: "/admin/agenda", icon: CalendarDays },
      { title: "Clientes", url: "/admin/clientes", icon: LayoutList },
      { title: "Axel Web", url: "/admin/chat", icon: Sparkles },
    ]
  },
  {
    label: "Marketing",
    items: [
      { title: "Redes Sociais", url: "/admin/redes-sociais", icon: Share2 },
      { title: "Tráfego Pago", url: "/admin/trafego-pago", icon: TrendingUp },
    ]
  },
  {
    label: "Sistema",
    items: [
      { title: "Assinatura", url: "/admin/assinatura", icon: CreditCard },
      { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
    ]
  }
];

export function DashboardSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isOwner } = useAuth();

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const isActive = (path: string) =>
    path === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(path);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/admin"}
                        className="hover:bg-muted/50 transition-colors"
                        activeClassName="bg-primary/10 text-primary font-semibold"
                        onClick={handleNavClick}
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
        ))}

        {isOwner && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Administração
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/admin-gerente")}>
                    <NavLink
                      to="/admin-gerente"
                      className="hover:bg-muted/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-semibold"
                      onClick={handleNavClick}
                    >
                      <Crown className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Gerente</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
