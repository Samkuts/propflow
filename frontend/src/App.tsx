import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LandingPage from '@/pages/LandingPage';
import Apply from '@/pages/Apply';
import Listings from '@/pages/Listings';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// Manager
import ManagerLogin from '@/portals/manager/pages/Login';
import ManagerRegister from '@/portals/manager/pages/Register';
import ManagerLayout from '@/portals/manager/ManagerLayout';
import Dashboard from '@/portals/manager/pages/Dashboard';
import Properties from '@/portals/manager/pages/Properties';
import PropertyDetail from '@/portals/manager/pages/PropertyDetail';
import UnitDetail from '@/portals/manager/pages/UnitDetail';
import LeaseCreate from '@/portals/manager/pages/LeaseCreate';
import TenantLedger from '@/portals/manager/pages/TenantLedger';
import Leases from '@/portals/manager/pages/Leases';
import Maintenance from '@/portals/manager/pages/Maintenance';
import Tenants from '@/portals/manager/pages/Tenants';
import Reports from '@/portals/manager/pages/Reports';
import Accounting from '@/portals/manager/pages/Accounting';
import Messages from '@/portals/manager/pages/Messages';
import Applications from '@/portals/manager/pages/Applications';
import ManagerSettings from '@/portals/manager/pages/Settings';
import LeaseDetail from '@/portals/manager/pages/LeaseDetail';

// Tenant
import TenantLayout from '@/portals/tenant/TenantLayout';
import TenantDashboard from '@/portals/tenant/pages/TenantDashboard';
import TenantMaintenance from '@/portals/tenant/pages/TenantMaintenance';
import TenantPayments from '@/portals/tenant/pages/TenantPayments';
import TenantDocuments from '@/portals/tenant/pages/TenantDocuments';
import TenantMessages from '@/portals/tenant/pages/TenantMessages';
import TenantSettings from '@/portals/tenant/pages/TenantSettings';
import { TenantLogin, OwnerLogin, VendorLogin } from '@/components/SharedLogin';

// Owner
import OwnerLayout from '@/portals/owner/OwnerLayout';
import OwnerDashboard from '@/portals/owner/pages/OwnerDashboard';
import OwnerProperties from '@/portals/owner/pages/OwnerProperties';
import OwnerStatements from '@/portals/owner/pages/OwnerStatements';
import OwnerSettings from '@/portals/owner/pages/OwnerSettings';

// Vendor
import VendorLayout from '@/portals/vendor/VendorLayout';
import VendorWorkOrders from '@/portals/vendor/pages/VendorWorkOrders';
import VendorSettings from '@/portals/vendor/pages/VendorSettings';

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
      {/* Landing */}
      <Route path="/" element={<LandingPage />} />

      {/* Public rental application — no auth required */}
      <Route path="/apply/:unitId" element={<Apply />} />

      {/* Public listings page */}
      <Route path="/listings" element={<Listings />} />

      {/* Password reset — public, no auth */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

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
        <Route path="properties/:id" element={<PropertyDetail />} />
        <Route path="properties/:propertyId/units/:unitId" element={<UnitDetail />} />
        <Route path="leases" element={<Leases />} />
        <Route path="leases/new" element={<LeaseCreate />} />
        <Route path="leases/:leaseId" element={<LeaseDetail />} />
        <Route path="leases/:leaseId/ledger" element={<TenantLedger />} />
        <Route path="accounting" element={<Accounting />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="tenants" element={<Tenants />} />
        <Route path="reports" element={<Reports />} />
        <Route path="messages" element={<Messages />} />
        <Route path="applications" element={<Applications />} />
        <Route path="settings" element={<ManagerSettings />} />
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
        <Route path="payments" element={<TenantPayments />} />
        <Route path="maintenance" element={<TenantMaintenance />} />
        <Route path="documents" element={<TenantDocuments />} />
        <Route path="messages" element={<TenantMessages />} />
        <Route path="settings" element={<TenantSettings />} />
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
        <Route path="properties" element={<OwnerProperties />} />
        <Route path="statements" element={<OwnerStatements />} />
        <Route path="settings" element={<OwnerSettings />} />
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
        <Route path="settings" element={<VendorSettings />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
