import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

const StockTable = () => {
  return (
    <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0 relative">
      <CardHeader>
        <CardTitle className="text-card-text text-lg">
          Current Stock Holdings
        </CardTitle>
      </CardHeader>

      <CardContent className="relative">
        {/* Blur overlay */}
        <div className="absolute inset-0 bg-white/90 backdrop-blur-xl z-10 rounded-md flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-700 mb-2">Coming Soon</div>
            <div className="text-sm text-gray-500">Stock holdings will be available soon</div>
          </div>
        </div>

        {/* Table content (blurred) */}
        <div className="w-full rounded-md overflow-x-auto">
          <table className="w-full table-fixed">
            <thead className="divide-y divide-gray-200">
              <tr className="bg-gray-50 border-b">
                <th scope="col" className="w-1/2 text-bold py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock
                </th>
                <th scope="col" className="w-1/2 text-bold py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="">
              <tr className="border-b border-gray-200">
                <td className="w-1/2 py-4 whitespace-nowrap text-sm text-gray-900">AAPL</td>
                <td className="w-1/2 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹1,500.00</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="w-1/2 py-4 whitespace-nowrap text-sm text-gray-900">GOOGL</td>
                <td className="w-1/2 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹14,000.00</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="w-1/2 py-4 whitespace-nowrap text-sm text-gray-900">AMZN</td>
                <td className="w-1/2 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹26,400.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export default StockTable