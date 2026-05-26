import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';

// Manager
import ManagerLogin from '@/portals/manager/pages/Login';
import ManagerRegister from '@/portals/manager/pages/Register';
import ManagerLayout from '@/portals/manager/ManagerLayout';
import Dashboard from '@/portals/manager/pages/Dashboard';
import Properties from '@/portals/manager/pages/Properties';

// Tenant
import TenantLayout from '@/portals/tenant/TenantLayout';
import TenantDashboard from '@/portals/tenant/pages/TenantDashboard';
import { TenantLogin, OwnerLogin, VendorLogin } from '@/components/SharedLogin';

// Owner
import OwnerLayout from '@/portals/owner/OwnerLayout';
import OwnerDashboard from '@/portals/owner/pages/OwnerDashboard';

// Vendor
import VendorLayout from '@/portals/vendor/VendorLayout';
import VendorWorkOrders from '@/portals/vendor/pages/VendorWorkOrders';

// Placeholder component for pages still being built
function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 text-2xl">🚧</div>
      <h2 className="text-xl font-semibold text-gray-900">{name}</h2>
      <p className="text-gray-400 text-sm mt-2">This module is next in the build queue</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<Navigate to="/manager/login" replace />} />

      {/* Manager auth */}
      <Route path="/manager/login" element={<ManagerLogin />} />
      <Route path="/manager/register" element={<ManagerRegister />} />

      {/* Manager portal */}
      <Route
        path="/manager"
        element={
          <ProtectedRoute role="MANAGER" loginPath="/manager/login">
            <ManagerLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="properties" element={<Properties />} />
        <Route path="properties/:id" element={<ComingSoon name="Property Detail" />} />
        <Route path="leases" element={<ComingSoon name="Leases" />} />
        <Route path="accounting" element={<ComingSoon name="Accounting" />} />
        <Route path="maintenance" element={<ComingSoon name="Maintenance" />} />
        <Route path="tenants" element={<ComingSoon name="Tenants" />} />
        <Route path="reports" element={<ComingSoon name="Reports" />} />
      </Route>

      {/* Tenant auth + portal */}
      <Route path="/tenant/login" element={<TenantLogin />} />
      <Route
        path="/tenant"
        element={
          <ProtectedRoute role="TENANT" loginPath="/tenant/login">
            <TenantLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<TenantDashboard />} />
        <Route path="payments" element={<ComingSoon name="Payment History" />} />
        <Route path="maintenance" element={<ComingSoon name="My Requests" />} />
        <Route path="documents" element={<ComingSoon name="Documents" />} />
      </Route>

      {/* Owner auth + portal */}
      <Route path="/owner/login" element={<OwnerLogin />} />
      <Route
        path="/owner"
        element={
          <ProtectedRoute role="OWNER" loginPath="/owner/login">
            <OwnerLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<OwnerDashboard />} />
        <Route path="properties" element={<ComingSoon name="My Properties" />} />
        <Route path="statements" element={<ComingSoon name="Statements" />} />
      </Route>

      {/* Vendor auth + portal */}
      <Route path="/vendor/login" element={<VendorLogin />} />
      <Route
        path="/vendor"
        element={
          <ProtectedRoute role="VENDOR" loginPath="/vendor/login">
            <VendorLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="work-orders" replace />} />
        <Route path="work-orders" element={<VendorWorkOrders />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
