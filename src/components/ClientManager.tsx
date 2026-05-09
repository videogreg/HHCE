import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Client, DayOfWeek } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, Users, Upload } from 'lucide-react';
import { parseClientsCSV } from '../utils/csvParser';

const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const ClientManager: React.FC = () => {
  const { clients, setClients } = useAppContext();
  const [newClient, setNewClient] = useState<Partial<Client>>({
    name: '',
    address: '',
    preferredDays: [],
    notBefore: '09:00',
    notAfter: '17:00'
  });

  const addClient = () => {
    if (newClient.name) {
      const client: Client = {
        id: uuidv4(),
        name: newClient.name,
        address: newClient.address || '',
        preferredDays: newClient.preferredDays || [],
        notBefore: newClient.notBefore,
        notAfter: newClient.notAfter,
        preferredCleaners: [],
        avoidCleaners: []
      };
      setClients([...clients, client]);
      setNewClient({ name: '', address: '', preferredDays: [], notBefore: '09:00', notAfter: '17:00' });
    }
  };

  const removeClient = (id: string) => {
    setClients(clients.filter(c => c.id !== id));
  };

  const toggleDay = (day: DayOfWeek) => {
    const current = newClient.preferredDays || [];
    if (current.includes(day)) {
      setNewClient({ ...newClient, preferredDays: current.filter(d => d !== day) });
    } else {
      setNewClient({ ...newClient, preferredDays: [...current, day] });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const parsed = parseClientsCSV(text);
        setClients([...clients, ...parsed as Client[]]);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Users className="text-green-600" /> Manage Clients
        </h2>
        <label className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded cursor-pointer hover:bg-green-100 transition-colors">
          <Upload size={16} />
          <span className="text-sm font-medium">Import Jobber CSV</span>
          <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6 p-4 border border-green-100 rounded bg-green-50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="client-name" className="block text-sm font-medium text-gray-700">Name</label>
            <input
              id="client-name"
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
              value={newClient.name}
              onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="client-address" className="block text-sm font-medium text-gray-700">Address</label>
            <input
              id="client-address"
              type="text"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
              value={newClient.address}
              onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Days (e.g. Tuesday-only)</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(day => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  newClient.preferredDays?.includes(day)
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-green-500'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Not Before</label>
            <input
              type="time"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
              value={newClient.notBefore}
              onChange={(e) => setNewClient({ ...newClient, notBefore: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Not After</label>
            <input
              type="time"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
              value={newClient.notAfter}
              onChange={(e) => setNewClient({ ...newClient, notAfter: e.target.value })}
            />
          </div>
        </div>

        <button
          onClick={addClient}
          className="flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Client
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Restrictions</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clients.map((client) => (
              <tr key={client.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{client.name}</div>
                  <div className="text-xs text-gray-500">{client.address}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {client.preferredDays.map(d => (
                      <span key={d} className="px-1.5 py-0.5 rounded-sm bg-green-100 text-green-800 text-[10px] font-bold uppercase">
                        {d.substring(0, 3)}
                      </span>
                    ))}
                    {client.preferredDays.length === 0 && <span className="text-xs text-gray-400 italic">Any day</span>}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono uppercase">
                    Window: {client.notBefore} - {client.notAfter}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => removeClient(client.id)} className="text-red-600 hover:text-red-900">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
