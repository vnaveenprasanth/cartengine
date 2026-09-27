import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
import { ShoppingCart, Package, BarChart3, ShoppingBag } from 'lucide-react'
import { api, type Cart } from './lib/api'
import ProductGrid from './components/ProductGrid'
import CartPanel from './components/CartPanel'
import CheckoutFlow from './components/CheckoutFlow'
import AdminDashboard from './components/AdminDashboard'
import './index.css'

type View = 'products' | 'cart' | 'checkout' | 'admin'

export default function App() {
  const [view, setView] = useState<View>('products')
  const [cart, setCart] = useState<Cart | null>(null)
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('cartId')
    if (stored) {
      api.carts.get(stored)
        .then((r) => {
          if (r.cart.status === 'active') setCart(r.cart)
          else localStorage.removeItem('cartId')
        })
        .catch(() => localStorage.removeItem('cartId'))
    }
  }, [])

  async function ensureCart(): Promise<Cart> {
    if (cart) return cart
    const { cart: newCart } = await api.carts.create()
    localStorage.setItem('cartId', newCart.id)
    setCart(newCart)
    return newCart
  }

  function refreshCart(updated: Cart) {
    setCart(updated)
  }

  function handleOrderComplete(orderId: string) {
    setCart(null)
    localStorage.removeItem('cartId')
    setCompletedOrderId(orderId)
    setView('checkout')
  }

  function navigateTo(newView: View) {
    setView(newView)
    if (newView !== 'checkout') {
      setCompletedOrderId(null)
    }
  }

  const itemCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0

  return (
    <div className="min-h-screen flex flex-col">
      <Toaster 
        position="top-right" 
        theme="dark"
        toastOptions={{
          className: 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-primary)] shadow-2xl rounded-2xl font-medium tracking-wide',
        }}
        closeButton 
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-[var(--color-brand-400)]" />
            <span className="font-bold text-lg tracking-tight">CartEngine</span>
          </div>

          <nav className="flex items-center gap-1">
            <NavBtn active={view === 'products'} onClick={() => navigateTo('products')}>
              <Package className="w-4 h-4" />
              Products
            </NavBtn>
            <NavBtn active={view === 'cart'} onClick={() => navigateTo('cart')}>
              <ShoppingCart className="w-4 h-4" />
              Cart
              {itemCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-[var(--color-brand-500)] text-white font-bold">
                  {itemCount}
                </span>
              )}
            </NavBtn>
            <NavBtn active={view === 'admin'} onClick={() => navigateTo('admin')}>

              <BarChart3 className="w-4 h-4" />
              Admin
            </NavBtn>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {view === 'products' && (
          <ProductGrid
            cart={cart}
            ensureCart={ensureCart}
            refreshCart={refreshCart}
          />
        )}
        {view === 'cart' && (
          <CartPanel
            cart={cart}
            refreshCart={refreshCart}
            onCheckout={() => navigateTo('checkout')}
          />
        )}
        {view === 'checkout' && (
          <CheckoutFlow
            cart={cart}
            completedOrderId={completedOrderId}
            onOrderComplete={handleOrderComplete}
            onBack={() => navigateTo('cart')}
          />
        )}
        {view === 'admin' && <AdminDashboard />}
      </main>
    </div>
  )
}

function NavBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--color-brand-600)] text-white'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}
