"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Head from "next/head";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import DashboardLayout from "../dashboard/layout";
import { User, Mail, Phone, Building, AlertCircle, Loader } from 'lucide-react';
import { useRouter, useSearchParams } from "next/navigation";

interface InvestorData {
  id: string;
  iQode: string;
  Name: string;
  Last_name: string;
  Email: string;
  Phone: string;
  Strategy_Invested_In: string;
  Broker: string;
  Mobile_No_Linked_to_Zerodha: string;
  Email_Linked_to_Zerodha: string;
  Performance_Fee: string;
  Fixed_Fee: string;
  Old_Fee_Structure: string;
  Hurdle_Rat: string;
  GST_as_Applicable: string;
  Current_AUM: number;
  Invested_Amount: number;
}

interface APIResponse {
  success: boolean;
  data: InvestorData[];
  pagination: {
    page: number;
    per_page: number;
    has_more: boolean;
    total_count: number;
  };
  error?: string;
}

const PersonalDetailsPage = () => {
  const { data: session, status } = useSession();
  const [clientData, setClientData] = useState<InvestorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
const router = useRouter();
  useEffect(() => {
     if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    // Only fetch data once when session is authenticated and we haven't fetched yet
    if (status === 'authenticated' && session?.user?.icode && !hasFetched.current) {
      fetchClientData();
      hasFetched.current = true;
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status, session?.user?.icode]);

  const fetchClientData = async () => {
    if (!session?.user?.icode) {
      setError('No ICode found in session');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/zoho/accounts');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: APIResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      console.log('API Response:', result);
      console.log('Total records:', result.data?.length || 0);
      console.log('Looking for icode:', session.user.icode);

      // Log available icodes for debugging
      if (result.data && result.data.length > 0) {
        console.log('Available iQodes:',
          result.data.map(client => client.iQode).filter(Boolean)
        );
        console.log('First record structure:', Object.keys(result.data[0]));
      }

      // Find the specific client data based on session.user.icode
      const clientInfo = result.data.find(
        client => client.iQode=== session.user.icode
      );

      if (clientInfo) {
        console.log('Client data found:', clientInfo);
        setClientData(clientInfo);
      } else {
        const errorMsg = `No client data found for icode: ${session.user.icode}. Total records in database: ${result.data?.length || 0}`;
        console.error(errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      console.error('Error fetching client data:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const PersonalInformationCard = () => (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
        <CardTitle className="text-black p-3 rounded-t-sm   text-lg font-heading-bold flex items-center space-x-2">
          <span>Personal Information</span>
        </CardTitle>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Full Name</label>
            <p className="text-card-text font-medium">
              {clientData?.Name} {clientData?.Last_name}
            </p>
          </div>

          {clientData?.Email && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</label>
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400">{clientData.Email}</p>
              </div>
            </div>
          )}

          {clientData?.Phone && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone Number</label>
              <div className="flex items-center space-x-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400">{clientData.Phone}</p>
              </div>
            </div>
          )}

          {/* {clientData?.Current_AUM && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Current AUM</label>
              <div className="flex items-center space-x-2">
                <IndianRupee className="h-4 w-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400">
                  {clientData.Current_AUM.toLocaleString('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0
                  })}
                </p>
              </div>
            </div>
          )} */}
        </div>
      </CardContent>
    </Card>
  );

  const AccountInformationCard = () => (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      
        <CardTitle className="text-black p-3 rounded-t-sm   text-lg font-heading-bold flex items-center space-x-2">
          <span>Account Information</span>
        </CardTitle>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clientData?.Strategy_Invested_In && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Investment Strategy</label>
              <div className="flex items-center space-x-2">
                <Building className="h-4 w-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400">{clientData.Strategy_Invested_In}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500  tracking-wide">iQode</label>
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4 text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400">{clientData?.iQode}</p>
            </div>
          </div>

          {/* {clientData?.Invested_Amount && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Invested Amount</label>
              <div className="flex items-center space-x-2">
                <IndianRupee className="h-4 w-4 text-gray-400" />
                <p className="text-gray-600 dark:text-gray-400">
                  {clientData.Invested_Amount.toLocaleString('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0
                  })}
                </p>
              </div>
            </div>
          )} */}

          {/* Fee Structure */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Fee Structure</label>
            <div className="flex flex-col space-y-2">
              {clientData?.Performance_Fee && (
                <>
                  {clientData.Performance_Fee.split(',').map((fee, index) => (
                    <div key={`perf-${index}`} className="flex items-start space-x-2">
                      <span className="text-gray-400 mt-0.5">•</span>
                      <p className="text-gray-600 dark:text-gray-400">
                        Performance Fee: {fee.trim()}
                      </p>
                    </div>
                  ))}
                </>
              )}
              {clientData?.Fixed_Fee && (
                <>
                  {clientData.Fixed_Fee.split(',').map((fee, index) => (
                    <div key={`fixed-${index}`} className="flex items-start space-x-2">
                      <span className="text-gray-400 mt-0.5">•</span>
                      <p className="text-gray-600 dark:text-gray-400">
                        Fixed Fee: {fee.trim()}
                      </p>
                    </div>
                  ))}
                </>
              )}
              {clientData?.Hurdle_Rat && (
                <div className="flex items-start space-x-2">
                  <span className="text-gray-400 mt-0.5">•</span>
                  <p className="text-gray-600 dark:text-gray-400">
                    Hurdle Rate: {clientData.Hurdle_Rat}
                  </p>
                </div>
              )}
              {clientData?.GST_as_Applicable && (
                <div className="flex items-start space-x-2">
                  <span className="text-gray-400 mt-0.5">•</span>
                  <p className="text-gray-600 dark:text-gray-400">
                    GST: {clientData.GST_as_Applicable}
                  </p>
                </div>
              )}
              {!clientData?.Performance_Fee && !clientData?.Fixed_Fee && !clientData?.Hurdle_Rat && !clientData?.GST_as_Applicable && (
                <p className="text-gray-400 italic">Not provided</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const BrokerDetailsCard = () => {
    return (
      <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
        <CardTitle className="text-black p-3 rounded-t-sm   text-lg font-heading-bold flex items-center space-x-2">
          <span>Broker Details</span>
        </CardTitle>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clientData?.Broker && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Broker Name</label>
                <div className="flex items-center space-x-2">
                  <Building className="h-4 w-4 text-gray-400" />
                  <p className="text-gray-600 dark:text-gray-400">{clientData.Broker}</p>
                </div>
              </div>
            )}

            {clientData?.Mobile_No_Linked_to_Zerodha ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Linked Mobile</label>
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <p className="text-gray-600 dark:text-gray-400">{clientData.Mobile_No_Linked_to_Zerodha}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Linked Mobile</label>
                <p className="text-gray-400 italic">Not provided</p>
              </div>
            )}

            {clientData?.Email_Linked_to_Zerodha ? (
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Linked Email</label>
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <p className="text-gray-600 dark:text-gray-400">{clientData.Email_Linked_to_Zerodha}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Linked Email</label>
                <p className="text-gray-400 italic">Not provided</p>
              </div>
            )}

            {(!clientData?.Broker && !clientData?.Mobile_No_Linked_to_Zerodha && !clientData?.Email_Linked_to_Zerodha) && (
              <div className="text-center py-6 border-t border-gray-100">
                <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No broker details available</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Handle authentication states
  if (status === 'loading') {
    return (
      <DashboardLayout>
        <div className="sm:p-2 space-y-6">
          <div className="flex justify-center items-center h-40">
            <div className="text-center">
              <Loader className="h-8 w-8 animate-spin text-button-text mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Loading session...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <DashboardLayout>
        <div className="sm:p-2 space-y-6">
          <div className="flex justify-center items-center h-40">
            <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0  w-full mx-4">
              <CardContent className="p-6 text-center">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-card-text font-heading-bold mb-4">Authentication Required</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">Please log in to view your personal details.</p>
                <button
                  onClick={() => signIn()}
                  className="w-full bg-button-text text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                >
                  Sign In
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="sm:p-2 space-y-6">
          <div className="flex justify-center items-center h-40">
            <div className="text-center">
              <Loader className="h-8 w-8 animate-spin text-button-text mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Loading your details...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="sm:p-2 space-y-6">
          <div className="flex justify-center items-center h-40">
            <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0  w-full mx-4">
              <CardContent className="p-6 text-center">
                <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-card-text font-heading-bold mb-4">Error Loading Data</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
                <button
                  onClick={() => {
                    hasFetched.current = false;
                    fetchClientData();
                  }}
                  className="w-full bg-button-text text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                >
                  Try Again
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!clientData) {
    return (
      <DashboardLayout>
        <div className="sm:p-2 space-y-6">
          <div className="flex justify-center items-center h-40">
            <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0  w-full mx-4">
              <CardContent className="p-6 text-center">
                <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-card-text font-heading-bold mb-2">No Data Found</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  No personal details found for your account.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Head>
        <title>Personal Details - Qode Invest</title>
        <meta
          name="description"
          content="View your personal details and account information in your Qode Invest dashboard."
        />
        <meta name="author" content="Qode" />
      </Head>
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-card-text-secondary font-heading">
              Personal Details
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Your account information and details
            </p>
          </div>

          {/* Cards in Vertical Layout */}
          <div className="space-y-6 mx-auto">
            <PersonalInformationCard />
            <AccountInformationCard />
            <BrokerDetailsCard />
          </div>
        </div>
      </DashboardLayout>
    </>
  );
};

export default PersonalDetailsPage;