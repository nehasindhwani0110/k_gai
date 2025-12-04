'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname();

  const menuItems = [
    {
      title: 'Analytics',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      href: '/analytics',
      subItems: [
        { title: 'Dashboard', href: '/analytics' },
        { title: 'Query Builder', href: '/analytics?tab=query' },
      ],
    },
  ];

  const isActive = (href: string) => {
    if (href === '/analytics') {
      return pathname === '/analytics' || pathname?.startsWith('/analytics');
    }
    return pathname === href;
  };

  return (
    <>
      {/* Mobile overlay */}
      {!isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
          w-64
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo/Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Analytics</h1>
                <p className="text-xs text-gray-500">Multi-tenant</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            {menuItems.map((item) => (
              <div key={item.title} className="mb-6">
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                    ${isActive(item.href)
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                      : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  <span className={isActive(item.href) ? 'text-white' : 'text-gray-600'}>
                    {item.icon}
                  </span>
                  <span className="font-medium">{item.title}</span>
                </Link>

                {/* Sub-items */}
                {item.subItems && item.subItems.length > 0 && (
                  <div className="mt-2 ml-4 space-y-1">
                    {item.subItems.map((subItem) => {
                      const subActive = pathname === subItem.href || 
                        (subItem.href.includes('?tab=') && pathname === '/analytics');
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className={`
                            block px-4 py-2 rounded-lg text-sm transition-all duration-200
                            ${subActive
                              ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600'
                              : 'text-gray-600 hover:bg-gray-50'
                            }
                          `}
                        >
                          {subItem.title}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 text-center">
              <p>Schema-Agnostic</p>
              <p className="mt-1">Multi-Tenant Analytics</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

