import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Cleaner } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, UserPlus } from 'lucide-react';

export const CleanerManager: React.FC = () => {
  const { cleaners, setCleaners } = useAppContext();
  const [newCleaner, setNewCleaner] = useState<Partial<Cleaner>>({
    name: '',
    isDriver: false,
    canStartAt: '08:00',
    mustBeOffBy: '17:00',
    cannotWorkWith: [],
    active: true
  });

  const addCleaner = () => {
    if (newCleaner.name) {
      const cleaner: Cleaner = {
        id: uuidv4(),
        name: newCleaner.name,
        isDriver: !!newCleaner.isDriver,
        canStartAt: newCleaner.canStartAt,
        mustBeOffBy: newCleaner.mustBeOffBy,
        cannotWorkWith: newCleaner.cannotWorkWith || [],
        active: true,
      };
      setCleaners([...cleaners, cleaner]);
      setNewCleaner({ name: '', isDriver: false, canStartAt: '08:00', mustBeOffBy: '17:00', cannotWorkWith: [], active: true });
    }
  };

  const removeCleaner = (id: string) => {
    setCleaners(cleaners.filter(c => c.id !== id));
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <UserPlus className="text-blue-600" /> Manage Cleaners
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border border-blue-100 rounded bg-blue-50">
        <div>
          <label htmlFor="cleaner-name" className="block text-sm font-medium text-gray-700">Name</label>
          <input
            id="cleaner-name"
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            value={newCleaner.name}
            onChange={(e) => setNewCleaner({ ...newCleaner, name: e.target.value })}
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="inline-flex items-center">
            <input
              id="is-driver"
              type="checkbox"
              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              checked={newCleaner.isDriver}
              onChange={(e) => setNewCleaner({ ...newCleaner, isDriver: e.target.checked })}
            />
            <span className="ml-2 text-sm text-gray-700">Is Driver</span>
          </label>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Cannot Work With (Cleaner IDs, comma separated)</label>
          <input
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            value={newCleaner.cannotWorkWith?.join(', ')}
            onChange={(e) => setNewCleaner({ ...newCleaner, cannotWorkWith: e.target.value.split(',').map(s => s.trim()).filter(s => s) })}
            placeholder="e.g. c1, c2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Start Time</label>
          <input
            type="time"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            value={newCleaner.canStartAt}
            onChange={(e) => setNewCleaner({ ...newCleaner, canStartAt: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Off By</label>
          <input
            type="time"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            value={newCleaner.mustBeOffBy}
            onChange={(e) => setNewCleaner({ ...newCleaner, mustBeOffBy: e.target.value })}
          />
        </div>
        <button
          onClick={addCleaner}
          className="md:col-span-2 flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Cleaner
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {cleaners.map((cleaner) => (
              <tr key={cleaner.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cleaner.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cleaner.isDriver ? 'Yes' : 'No'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {cleaner.canStartAt} - {cleaner.mustBeOffBy}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => removeCleaner(cleaner.id)} className="text-red-600 hover:text-red-900">
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
