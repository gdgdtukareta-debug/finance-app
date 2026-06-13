'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, BarChart2, Settings } from 'lucide-react';

const navItems = [
  { href: '/',            label: 'ホーム',     icon: LayoutDashboard },
  { href: '/portfolio',   label: '銘柄',       icon: Briefcase },
  { href: '/chart',       label: 'チャート',   icon: BarChart2 },
  { href: '/settings',    label: '設定',       icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link key={href} href={href} className={isActive ? 'active' : ''}>
            <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
