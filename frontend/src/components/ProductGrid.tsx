import { useState, useEffect } from 'react'
import { api, type Product, type Cart } from '../lib/api'
import { toast } from 'sonner'
import { PackageOpen, Plus, Loader2, ShoppingBag } from 'lucide-react'

const PRODUCT_IMAGES: Record<string, string> = {
  'Wireless Bluetooth Headphones': '/images/headphones.jpg',
  'USB-C Fast Charging Cable': '/images/cable.jpg',
  'Mechanical Keyboard (Cherry MX)': '/images/keyboard.jpg',
  'Limited Edition Smart Watch': '/images/smartwatch.jpg',
  'Portable SSD 1TB': '/images/ssd.jpg',
  'Noise Cancelling Earbuds': '/images/earbuds.jpg',
}

export default function ProductGrid({
  cart,
  ensureCart,
  refreshCart,
}: {
  cart: Cart | null
  ensureCart: () => Promise<Cart>
  refreshCart: (c: Cart) => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    api.products.list()
      .then(res => setProducts(res.products))
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd(product: Product) {
    setAddingId(product.id)
    try {
      const activeCart = await ensureCart()
      const res = await api.carts.addItem(activeCart.id, product.id, 1)
      refreshCart(res.cart)
      toast.success(`Added ${product.name} to cart`)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setAddingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-muted)]" />
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
        <PackageOpen className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg">No products available</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {products.map(product => {
        const inCart = cart?.items.find(i => i.productId === product.id)?.quantity ?? 0
        const outOfStock = product.inventory === 0
        const isAdding = addingId === product.id
        const imageUrl = PRODUCT_IMAGES[product.name] || '/images/placeholder.jpg'

        return (
          <div key={product.id} className={`group relative bg-[var(--color-surface-2)] rounded-3xl border border-[var(--color-border)] overflow-hidden shadow-[var(--shadow-card)] transition-all duration-300 hover:shadow-[0_8px_40px_rgb(0,0,0,0.6)] hover:-translate-y-1.5 hover:border-[var(--color-brand-500)]/50 flex flex-col ${outOfStock ? 'opacity-60 grayscale-[0.7] hover:grayscale-0' : ''}`}>
            
            {/* Image Section */}
            <div className="relative aspect-[4/3] w-full overflow-hidden">
              {/* block ensures no inline descender spacing */}
              <img src={imageUrl} alt={product.name} className="block w-full h-full object-cover transform scale-105 transition-transform duration-700 group-hover:scale-110" />
              
              {/* Stock Badge Overlay */}
              <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
                {outOfStock ? (
                  <span className="px-3.5 py-1.5 bg-red-500/10 text-red-400 text-xs font-bold uppercase tracking-wider rounded-full backdrop-blur-md shadow-sm border border-red-500/20">Sold Out</span>
                ) : product.inventory <= 10 ? (
                  <span className="px-3.5 py-1.5 bg-orange-500/10 text-orange-400 text-xs font-bold uppercase tracking-wider rounded-full backdrop-blur-md shadow-sm border border-orange-500/20">Only {product.inventory} left</span>
                ) : null}
              </div>
              
              {/* In Cart Badge */}
              {inCart > 0 && (
                <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur-md text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-sm border border-white/10">
                  <ShoppingBag className="w-3.5 h-3.5 opacity-80" />
                  {inCart} in cart
                </div>
              )}
            </div>

            {/* Content Section */}
            <div className="p-6 flex flex-col flex-1 relative z-20">
              <div className="flex justify-between items-start gap-4 mb-3">
                <h3 className="text-xl font-bold leading-tight line-clamp-2 drop-shadow-sm">{product.name}</h3>
                <span className="text-2xl font-black text-white shrink-0 drop-shadow-sm">${(product.priceCents / 100).toFixed(2)}</span>
              </div>
              
              <div className="text-sm text-[var(--color-text-secondary)] mb-6 flex-1">
                {product.inventory > 10 && <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> In stock and ready to ship</span>}
              </div>

              <button
                onClick={() => handleAdd(product)}
                disabled={outOfStock || isAdding}
                className="w-full flex justify-center items-center gap-2 py-3.5 bg-[var(--color-surface-3)] hover:bg-[var(--color-brand-600)] border border-[var(--color-border)] hover:border-[var(--color-brand-500)] text-white rounded-xl font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group-hover:bg-[var(--color-brand-600)] group-hover:border-[var(--color-brand-500)] shadow-sm"
              >
                {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                {isAdding ? 'Adding...' : outOfStock ? 'Out of Stock' : 'Add to Cart'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
