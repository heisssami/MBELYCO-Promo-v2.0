export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
          <h1 className="text-4xl font-bold">MBELYCO Promo v2.0</h1>
        </div>
      </div>

      <div className="relative flex place-items-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-4">
            Promo Code Management System
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Production-grade full-stack web application for secure, auditable promo code lifecycle management
          </p>
        </div>
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4 lg:text-left">
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
          <h3 className="mb-3 text-2xl font-semibold">
            Admin Dashboard
          </h3>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Manage batches, promo codes, and monitor redemptions
          </p>
        </div>

        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
          <h3 className="mb-3 text-2xl font-semibold">
            USSD Integration
          </h3>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Automated redemption via Africa&apos;s Talking API
          </p>
        </div>

        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
          <h3 className="mb-3 text-2xl font-semibold">
            MoMo Disbursements
          </h3>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Automated payments via MTN Mobile Money
          </p>
        </div>

        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
          <h3 className="mb-3 text-2xl font-semibold">
            Audit Trail
          </h3>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Complete tracking and reporting system
          </p>
        </div>
      </div>
    </main>
  )
}
