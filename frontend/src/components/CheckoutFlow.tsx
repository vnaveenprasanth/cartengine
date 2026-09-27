import { useState, useRef, useEffect } from 'react'
import { api, type Cart, type Order, fmt, uuid } from '../lib/api'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, ArrowLeft, Ticket } from 'lucide-react'

export default function CheckoutFlow({
  cart,
  completedOrderId,
  onOrderComplete,
  onBack,
}: {
  cart: Cart | null
  completedOrderId: string | null
  onOrderComplete: (orderId: string) => void
  onBack: () => void
}) {
  // Idempotency key generated once per component mount (per checkout session)
  const idempotencyKey = useRef(uuid())
  
  const [couponCode, setCouponCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [orderData, setOrderData] = useState<Order | null>(null)
  
  // If we already completed an order, fetch its details to display receipt
  useEffect(() => {
    if (completedOrderId) {
      api.orders.get(completedOrderId)
        .then(res => setOrderData(res.order))
        .catch(err => toast.error(`Failed to load receipt: ${err.message}`))
    }
  }, [completedOrderId])

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault()
    if (!cart) return

    setLoading(true)
    try {
      const res = await api.checkout(cart.id, idempotencyKey.current, couponCode || undefined)
      toast.success('Order placed successfully!')
      onOrderComplete(res.order.id)
    } catch (err: any) {
      // If CART_ALREADY_CHECKED_OUT, it means another window might have checked it out
      if (err.code === 'CART_ALREADY_CHECKED_OUT') {
        toast.error('This cart has already been checked out.')
      } else if (err.code === 'INSUFFICIENT_INVENTORY') {
        toast.error('Some items are out of stock. Please adjust your cart.')
      } else {
        toast.error(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  // --- Success Receipt View ---
  if (completedOrderId) {
    if (!orderData) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>

    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[var(--color-success)]/20 text-[var(--color-success)] mb-6">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Order Confirmed!</h1>
        <p className="text-[var(--color-text-secondary)] mb-8">
          Thank you for your purchase. Order #{orderData.orderNumber}
        </p>

        <div className="bg-[var(--color-surface-2)] rounded-2xl p-6 border border-[var(--color-border)] text-left mb-8">
          <h3 className="font-bold border-b border-[var(--color-border)] pb-4 mb-4">Receipt</h3>
          
          <div className="space-y-4 mb-6">
            {orderData.items.map(item => (
              <div key={item.id} className="flex justify-between">
                <span>{item.quantity}x {item.productName}</span>
                <span>{fmt(item.lineTotalCents)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-[var(--color-border)] pt-4 space-y-2 text-sm text-[var(--color-text-secondary)]">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{fmt(orderData.subtotalCents)}</span>
            </div>
            {orderData.discountCents > 0 && (
              <div className="flex justify-between text-[var(--color-success)] font-medium">
                <span>Discount Applied</span>
                <span>-{fmt(orderData.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg text-[var(--color-text-primary)] font-bold pt-2 border-t border-[var(--color-border)] mt-2">
              <span>Total Paid</span>
              <span>{fmt(orderData.totalCents)}</span>
            </div>
          </div>
        </div>

        <button onClick={onBack} className="text-[var(--color-brand-400)] hover:underline font-medium">
          Continue Shopping
        </button>
      </div>
    )
  }

  // --- Checkout Form View ---
  if (!cart) return null

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-[var(--color-text-secondary)] hover:text-white mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Cart
      </button>

      <div className="bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] p-6 md:p-8 shadow-[var(--shadow-card)]">
        <h2 className="text-2xl font-bold mb-8">Complete Checkout</h2>

        <div className="space-y-4 mb-8">
          {cart.items.map(item => (
            <div key={item.productId} className="flex justify-between items-center text-sm">
              <span className="text-[var(--color-text-secondary)]">{item.quantity}x {item.productName}</span>
              <span className="font-medium">{fmt(item.lineTotalCents)}</span>
            </div>
          ))}
          <div className="pt-4 border-t border-[var(--color-border)] flex justify-between items-center font-bold text-lg">
            <span>Subtotal</span>
            <span>{fmt(cart.subtotalCents)}</span>
          </div>
        </div>

        <form onSubmit={handleCheckout} className="space-y-6 border-t border-[var(--color-border)] pt-8">
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Ticket className="w-4 h-4 text-[var(--color-text-secondary)]" />
              Reward Coupon (Optional)
            </label>
            <input
              type="text"
              value={couponCode}
              onChange={e => setCouponCode(e.target.value)}
              placeholder="e.g. REWARD-5-ABCDEF"
              className="w-full bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--color-brand-500)] transition-colors uppercase"
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              Every 5th order unlocks a 10% discount coupon in the Admin dashboard.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-500)] text-white py-3.5 px-4 rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? 'Processing...' : `Pay ${fmt(cart.subtotalCents)}`}
          </button>
        </form>
      </div>
    </div>
  )
}
