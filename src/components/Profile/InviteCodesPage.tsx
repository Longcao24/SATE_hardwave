import React, { useState, useEffect } from 'react';
import { Copy, Check, Plus, X, Clock, Users, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import {
  generateInviteCode,
  getMyInviteCodes,
  deactivateInviteCode,
  type InviteCode,
} from '@/services/inviteCodeService';

const InviteCodesPage: React.FC = () => {
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInviteCodes();
  }, []);

  const loadInviteCodes = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await getMyInviteCodes();
    if (error) {
      setError('Failed to load invite codes');
      console.error(error);
    } else {
      setInviteCodes(data || []);
    }
    setLoading(false);
  };

  const handleGenerateCode = async () => {
    setGenerating(true);
    setError(null);
    const { data, error } = await generateInviteCode(maxUses, expiresInDays);
    if (error) {
      setError('Failed to generate invite code');
      console.error(error);
    } else if (data) {
      setInviteCodes([data, ...inviteCodes]);
      setShowCreateForm(false);
      setMaxUses(1);
      setExpiresInDays(undefined);
    }
    setGenerating(false);
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleDeactivateCode = async (codeId: string) => {
    if (!confirm('Are you sure you want to deactivate this invite code?')) {
      return;
    }

    const { success, error } = await deactivateInviteCode(codeId);
    if (error) {
      setError('Failed to deactivate invite code');
      console.error(error);
    } else if (success) {
      await loadInviteCodes();
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const isMaxedOut = (code: InviteCode) => {
    return code.current_uses >= code.max_uses;
  };

  const getStatusColor = (code: InviteCode) => {
    if (!code.is_active) return 'bg-gray-100 text-gray-600';
    if (isExpired(code.expires_at)) return 'bg-red-100 text-red-600';
    if (isMaxedOut(code)) return 'bg-orange-100 text-orange-600';
    return 'bg-green-100 text-green-600';
  };

  const getStatusText = (code: InviteCode) => {
    if (!code.is_active) return 'Inactive';
    if (isExpired(code.expires_at)) return 'Expired';
    if (isMaxedOut(code)) return 'Max Uses Reached';
    return 'Active';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Invite Codes</h1>
              <p className="text-gray-600 mt-1">Generate and manage invite codes for new users</p>
            </div>
            <Button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Generate Code
            </Button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div className="bg-gray-50 rounded-lg p-6 border-2 border-blue-200 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Generate New Invite Code</h3>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Maximum Uses
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={maxUses}
                    onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="How many times can this code be used?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expires In (Days) - Optional
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={expiresInDays || ''}
                    onChange={(e) =>
                      setExpiresInDays(e.target.value ? parseInt(e.target.value) : undefined)
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave empty for no expiration"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleGenerateCode}
                    disabled={generating}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {generating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Generating...
                      </>
                    ) : (
                      'Generate Code'
                    )}
                  </Button>
                  <Button
                    onClick={() => setShowCreateForm(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Invite Codes List */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Invite Codes</h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : inviteCodes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No invite codes yet. Generate one to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {inviteCodes.map((code) => (
                <div
                  key={code.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <code className="text-2xl font-mono font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">
                          {code.code}
                        </code>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            code
                          )}`}
                        >
                          {getStatusText(code)}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>
                            {code.current_uses} / {code.max_uses} uses
                          </span>
                        </div>
                        {code.expires_at && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>
                              Expires: {new Date(code.expires_at).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        <div>
                          <span>Created: {new Date(code.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleCopyCode(code.code)}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        {copiedCode === code.code ? (
                          <>
                            <Check className="w-4 h-4 text-green-600" />
                            <span className="text-green-600">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </Button>
                      {code.is_active && (
                        <Button
                          onClick={() => handleDeactivateCode(code.id)}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InviteCodesPage;

