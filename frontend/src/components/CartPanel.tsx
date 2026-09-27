import { useState } from 'react'
import { api, type Cart, fmt } from '../lib/api'
import { toast } from 'sonner'
import { Trash2, Minus, Plus, ShoppingCart, ArrowRight } from 'lucide-react'

const PRODUCT_IMAGES: Record<string, string> = {
  'Wireless Bluetooth Headphones': '/images/headphones.jpg',
  'USB-C Fast Charging Cable': '/images/cable.jpg',
  'Mechanical Keyboard (Cherry MX)': '/images/keyboard.jpg',
  'Limited Edition Smart Watch': '/images/smartwatch.jpg',
  'Portable SSD 1TB': '/images/ssd.jpg',
  'Noise Cancelling Earbuds': '/images/earbuds.jpg',
}

export default function CartPanel({
  cart,
  refreshCart,
  onCheckout,
}: {
  cart: Cart | null
  refreshCart: (c: Cart) => void
  onCheckout: () => void
}) {
  const [updating, setUpdating] = useState<string | null>(null)

  if (!cart || cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-[var(--color-text-muted)]">
        <ShoppingCart className="w-16 h-16 mb-4 opacity-30" />
        <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
        <p>Add some products to get started.</p>
      </div>
    )
  }

  async function updateQty(productId: string, newQty: number) {
    setUpdating(productId)
    try {
      if (newQty <= 0) {
        await api.carts.removeItem(cart!.id, productId)
        // Optimistic local update since delete returns 204
        refreshCart({
          ...cart!,
          items: cart!.items.filter(i => i.productId !== productId),
        })
      } else {
        const res = await api.carts.updateItem(cart!.id, productId, newQty)
        refreshCart(res.cart)
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col lg:flex-row gap-8">
      {/* Items List */}
      <div className="flex-1 space-y-4">
        <h2 className="text-2xl font-bold mb-6">Shopping Cart</h2>
        
        {cart.items.map(item => {
          const imageUrl = PRODUCT_IMAGES[item.productName] || '/images/placeholder.jpg'
          return (
          <div key={item.productId} className="flex flex-col sm:flex-row sm:items-center gap-4 bg-[var(--color-surface-2)] p-4 rounded-2xl border border-[var(--color-border)]">
            <img src={imageUrl} alt={item.productName} className="w-16 h-16 rounded-lg object-cover bg-[var(--color-surface)]" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{item.productName}</h3>
              <div className="text-[var(--color-text-secondary)] mt-1">
                {fmt(item.unitPriceCents)} each
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center bg-[var(--color-surface-3)] rounded-lg p-1">
                <button
                  onClick={() => updateQty(item.productId, item.quantity - 1)}
                  disabled={updating === item.productId}
                  className="p-1.5 hover:bg-[var(--color-border)] rounded-md transition-colors disabled:opacity-50"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center font-medium">{item.quantity}</span>
                <button
                  onClick={() => updateQty(item.productId, item.quantity + 1)}
                  disabled={updating === item.productId || item.quantity >= item.inventory}
                  className="p-1.5 hover:bg-[var(--color-border)] rounded-md transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="w-24 text-right font-bold text-lg">
                {fmt(item.lineTotalCents)}
              </div>

              <button
                onClick={() => updateQty(item.productId, 0)}
                disabled={updating === item.productId}
                className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors disabled:opacity-50"
                title="Remove item"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )})}
      </div>

      {/* Summary */}
      <div className="w-full lg:w-80">
        <div className="bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] p-6 sticky top-24 shadow-[var(--shadow-card)]">
          <h3 className="text-lg font-bold mb-4">Order Summary</h3>
          
          <div className="flex justify-between items-center mb-6 text-[var(--color-text-secondary)]">
            <span>Subtotal ({cart.items.reduce((s, i) => s + i.quantity, 0)} items)</span>
            <span className="font-medium text-[var(--color-text-primary)]">{fmt(cart.subtotalCents)}</span>
          </div>

          <div className="border-t border-[var(--color-border)] pt-4 mb-6">
            <div className="flex justify-between items-end">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-bold">{fmt(cart.subtotalCents)}</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 text-right">Taxes and shipping calculated at checkout</p>
          </div>

          <button
            onClick={onCheckout}
            className="w-full flex items-center justify-center gap-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-500)] text-white py-3 px-4 rounded-xl font-bold transition-colors"
          >
            Proceed to Checkout
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
