import { useState, useEffect } from 'react'
import { api, type Report, type Coupon, fmt } from '../lib/api'
import { toast } from 'sonner'
import { Loader2, TrendingUp, Ticket, Users, RefreshCw } from 'lucide-react'

export default function AdminDashboard() {
  const [report, setReport] = useState<Report | null>(null)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const loadData = async () => {
    try {
      const [reportRes, couponsRes] = await Promise.all([
        api.admin.report(),
        api.admin.listCoupons()
      ])
      setReport(reportRes.report)
      setCoupons(couponsRes.coupons)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleGenerateCoupon() {
    setGenerating(true)
    try {
      await api.admin.generateCoupon()
      toast.success('Coupon generated successfully!')
      loadData()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setGenerating(false)
    }
  }

  if (loading || !report) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-[var(--color-text-secondary)]">Overview of store performance and reward coupons.</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface-3)] hover:bg-[var(--color-border)] rounded-lg font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[var(--color-surface-2)] p-6 rounded-2xl border border-[var(--color-border)]">
          <div className="flex items-center gap-3 text-[var(--color-text-secondary)] mb-4">
            <TrendingUp className="w-5 h-5 text-[var(--color-brand-400)]" />
            <h3 className="font-semibold">Net Revenue</h3>
          </div>
          <p className="text-4xl font-bold">{fmt(report.netRevenueCents)}</p>
          <div className="mt-4 text-sm text-[var(--color-text-muted)] flex justify-between">
            <span>Gross: {fmt(report.grossRevenueCents)}</span>
            <span>Discounts: -{fmt(report.totalDiscountsCents)}</span>
          </div>
        </div>

        <div className="bg-[var(--color-surface-2)] p-6 rounded-2xl border border-[var(--color-border)]">
          <div className="flex items-center gap-3 text-[var(--color-text-secondary)] mb-4">
            <Users className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold">Total Orders</h3>
          </div>
          <p className="text-4xl font-bold">{report.totalOrders}</p>
        </div>

        <div className="bg-[var(--color-surface-2)] p-6 rounded-2xl border border-[var(--color-border)] flex flex-col">
          <div className="flex items-center gap-3 text-[var(--color-text-secondary)] mb-4">
            <Ticket className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold">Coupons</h3>
          </div>
          <div className="flex justify-between items-end flex-1">
            <p className="text-4xl font-bold">{report.coupons.generated}</p>
            <div className="text-right text-sm text-[var(--color-text-muted)]">
              <p>{report.coupons.available} available</p>
              <p>{report.coupons.redeemed} redeemed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Product Sales & Coupons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
          <div className="p-6 border-b border-[var(--color-border)]">
            <h3 className="text-lg font-bold">Product Sales</h3>
          </div>
          <div className="divide-y divide-[var(--color-border)] max-h-96 overflow-y-auto">
            {report.productSales.map(p => (
              <div key={p.productId} className="flex justify-between items-center p-4 hover:bg-[var(--color-surface-3)]">
                <span className="font-medium">{p.productName}</span>
                <span className="text-[var(--color-text-secondary)] bg-[var(--color-surface)] px-2 py-1 rounded">
                  {p.totalQuantitySold} sold
                </span>
              </div>
            ))}
            {report.productSales.length === 0 && (
              <div className="p-8 text-center text-[var(--color-text-muted)]">No sales yet</div>
            )}
          </div>
        </div>

        <div className="bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] overflow-hidden flex flex-col">
          <div className="p-6 border-b border-[var(--color-border)] flex justify-between items-center">
            <h3 className="text-lg font-bold">Reward Coupons</h3>
            <button
              onClick={handleGenerateCoupon}
              disabled={generating}
              className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-500)] text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus />}
              Generate Coupon
            </button>
          </div>
          <div className="divide-y divide-[var(--color-border)] max-h-96 overflow-y-auto">
            {coupons.map(c => (
              <div key={c.id} className="flex justify-between items-center p-4 hover:bg-[var(--color-surface-3)]">
                <div>
                  <div className="font-mono font-bold tracking-wide">{c.code}</div>
                  <div className="text-sm text-[var(--color-text-muted)] mt-1">
                    Unlocked at Order #{c.milestoneOrderNumber} • {c.discountPercent}% Off
                  </div>
                </div>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${
                  c.status === 'available' 
                    ? 'border-[var(--color-success)] text-[var(--color-success)] bg-[var(--color-success)]/10'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)]'
                }`}>
                  {c.status.toUpperCase()}
                </span>
              </div>
            ))}
            {coupons.length === 0 && (
              <div className="p-8 text-center text-[var(--color-text-muted)]">No coupons generated</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Plus() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14"/><path d="M12 5v14"/>
    </svg>
  )
}
