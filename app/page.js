'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [menu, setMenu] = useState([]);
  const [newItem, setNewItem] = useState({ item_name: '', description: '', price: '', category: 'Main' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // View states: 'dashboard' (split view), 'orders_focus' (full screen orders), 'menu_focus' (full screen menu)
  const [activeView, setActiveView] = useState('dashboard');

  useEffect(() => {
    fetchInitialData();

    // 🔥 Real-time Streams fallback
    const orderSubscription = supabase
      .channel('realtime-orders')
      .on('postgres_changes', { event: '*', pattern: 'public', table: 'orders' }, () => {
        fetchInitialData();
      })
      .subscribe();

    const reservationSubscription = supabase
      .channel('realtime-reservations')
      .on('postgres_changes', { event: '*', pattern: 'public', table: 'reservations' }, () => {
        fetchInitialData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(orderSubscription);
      supabase.removeChannel(reservationSubscription);
    };
  }, []);

  // 🔄 Manual Pull/Refresh Function
  async function handleManualRefresh() {
    setIsRefreshing(true);
    await fetchInitialData();
    // Add a slight delay for user feedback styling animation
    setTimeout(() => setIsRefreshing(false), 600);
  }

  async function fetchInitialData() {
    const { data: orderData } = await supabase.from('orders').select('*, customers(name, phone_number)').order('created_at', { ascending: false });
    const { data: resData } = await supabase.from('reservations').select('*, customers(name, phone_number)').order('reservation_date', { ascending: true });
    const { data: feedData } = await supabase.from('feedback').select('*, customers(name)').order('created_at', { ascending: false });
    const { data: menuData } = await supabase.from('menu').select('*').order('category', { ascending: true });

    if (orderData) setOrders(orderData);
    if (resData) setReservations(resData);
    if (feedData) setFeedback(feedData);
    if (menuData) setMenu(menuData);
  }

  async function updateOrderStatus(orderId, newStatus) {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
    fetchInitialData();
  }

  async function handleAddMenuItem(e) {
    e.preventDefault();
    if (!newItem.item_name || !newItem.price) return alert('Please enter item name and price.');
    
    const payload = { 
      item_name: newItem.item_name, 
      description: newItem.description, 
      price: parseFloat(newItem.price), 
      category: newItem.category 
    };

    let error;
    if (newItem.id) {
      ({ error } = await supabase.from('menu').update(payload).eq('id', newItem.id));
    } else {
      ({ error } = await supabase.from('menu').insert([payload]));
    }

    if (error) {
      alert(error.message);
    } else {
      alert(newItem.id ? `Updated "${newItem.item_name}"` : `🎉 "${newItem.item_name}" is now live!`);
      setNewItem({ item_name: '', description: '', price: '', category: 'Main' });
      fetchInitialData();
    }
  }

  async function deleteMenuItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    const { error } = await supabase.from('menu').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchInitialData();
  }

  // Filter systems
  const liveOrders = orders.filter(o => o.status === 'pending' || o.status === 'ready');
  const completedOrders = orders.filter(o => o.status === 'completed');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-8 transition-all duration-300">
      
      {/* GLOBAL HEADER */}
      <header className="border-b border-gray-800 pb-5 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-orange-500 tracking-tight">🍽️ Kitchen Control Center</h1>
          <p className="text-gray-400 text-sm mt-1">Manage inbound payloads and expand active interface modules.</p>
        </div>
        
        {activeView !== 'dashboard' && (
          <button 
            onClick={() => setActiveView('dashboard')}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg border border-gray-700 transition"
          >
            ← Back to Main Dashboard
          </button>
        )}
      </header>

      {/* --- RENDER 1: FULL SCREEN LIVE INBOUND ORDERS FOCUS --- */}
      {activeView === 'orders_focus' && (
        <div className="animate-fadeIn">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black text-orange-400 flex items-center gap-2">🛍️ Live Inbound Kitchen Orders ({liveOrders.length})</h2>
            
            <div className="flex items-center gap-3">
              {/* Manual Sync Button inside Full Screen view */}
              <button 
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 text-xs font-bold bg-gray-900 hover:bg-gray-800 text-gray-300 px-4 py-2 rounded-lg border border-gray-800 transition disabled:opacity-50"
              >
                <span className={`inline-block ${isRefreshing ? 'animate-spin' : ''}`}>🔄</span> 
                {isRefreshing ? 'Syncing...' : 'Refresh List'}
              </button>
            </div>
          </div>
          
          {liveOrders.length === 0 ? (
            <div className="text-center py-20 bg-gray-900 rounded-xl border border-gray-800 text-gray-500">No active orders right now. Awaiting input...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {liveOrders.map(order => (
                <OrderCard key={order.id} order={order} onUpdate={updateOrderStatus} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- RENDER 2: FULL SCREEN EXPAND LIVE MENU FOCUS --- */}
      {activeView === 'menu_focus' && (
        <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
          <div className="bg-gray-900 p-8 rounded-2xl border border-gray-800">
            <h2 className="text-2xl font-black text-orange-400 mb-6">
              {newItem.id ? '✏️ Edit Menu Item' : '➕ Expand Live Menu (Full View)'}
            </h2>
            <form onSubmit={handleAddMenuItem} className="space-y-5">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold mb-1">Item Name</label>
                <input type="text" placeholder="e.g. Truffle Burger" value={newItem.item_name} onChange={e => setNewItem({...newItem, item_name: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-orange-500 text-lg" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold mb-1">Description</label>
                <textarea rows="3" placeholder="Description of choice ingredients..." value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-orange-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold mb-1">Price (₹)</label>
                  <input type="number" step="0.01" placeholder="14.50" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-orange-500 text-lg" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold mb-1">Category</label>
                  <select value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white focus:outline-none focus:border-orange-500 text-lg">
                    <option value="Main">Main</option>
                    <option value="Appetizer">Appetizer</option>
                    <option value="Drink">Drink</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-4">
                <button type="submit" className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold text-lg transition shadow-lg shadow-orange-950">
                  {newItem.id ? 'Update Item' : 'Publish to Menu Matrix'}
                </button>
                {newItem.id && (
                  <button type="button" onClick={() => setNewItem({ item_name: '', description: '', price: '', category: 'Main' })} className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition">Cancel</button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-gray-900 p-8 rounded-2xl border border-gray-800">
            <h2 className="text-2xl font-black text-orange-400 mb-6">📋 Current Menu Inventory</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {menu.length === 0 ? (
                <p className="text-gray-500 col-span-2 text-center py-4 italic">No items found in the menu.</p>
              ) : (
                menu.map(item => (
                  <div key={item.id} className="p-4 bg-gray-950 rounded-xl border border-gray-800 flex justify-between items-center group">
                    <div>
                      <h4 className="font-bold text-white group-hover:text-orange-400 transition-colors">{item.item_name}</h4>
                      <p className="text-xs text-gray-500">{item.category} • <span className="text-emerald-500 font-bold">₹{item.price}</span></p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setNewItem(item); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="p-2 text-blue-400 hover:bg-blue-900/30 rounded transition" title="Edit">✏️</button>
                      <button onClick={() => deleteMenuItem(item.id)} className="p-2 text-red-400 hover:bg-red-900/30 rounded transition" title="Delete">🗑️</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- RENDER 3: DEFAULT SPLIT DASHBOARD HOME VIEW --- */}
      {activeView === 'dashboard' && (
        <div className="space-y-8 animate-fadeIn">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Split View Left Component */}
            <div className="lg:col-span-2 space-y-8">
              {/* Active Orders Section */}
              <section className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-md">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-orange-400">🛍️ Live Inbound Orders ({liveOrders.length})</h2>
                  
                  {/* Action Row: Refresh and Expand combo */}
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleManualRefresh}
                      disabled={isRefreshing}
                      className="text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1 rounded border border-gray-700 transition disabled:opacity-50 flex items-center gap-1"
                    >
                      <span className={`inline-block text-[11px] ${isRefreshing ? 'animate-spin' : ''}`}>🔄</span>
                      {isRefreshing ? 'Syncing...' : 'Refresh'}
                    </button>
                    
                    <button 
                      onClick={() => setActiveView('orders_focus')} 
                      className="text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-orange-400 px-3 py-1 rounded border border-gray-700 transition"
                    >
                      ⤢ Expand Screen
                    </button>
                  </div>
                </div>
                
                {liveOrders.length === 0 ? (
                  <div className="text-center py-10 bg-gray-950 rounded-lg text-gray-600 text-sm">No active orders pending. Click refresh or wait.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {liveOrders.map(order => (
                      <OrderCard key={order.id} order={order} onUpdate={updateOrderStatus} />
                    ))}
                  </div>
                )}
              </section>

              {/* Reservations Sync Table */}
              <section className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-md">
                <h2 className="text-xl font-bold mb-4 text-orange-400">📅 Table Bookings ({reservations.length})</h2>
                <div className="overflow-x-auto rounded-lg border border-gray-800">
                  <table className="w-full text-left text-sm text-gray-300">
                    <thead className="text-xs uppercase bg-gray-950 text-gray-400">
                      <tr>
                        <th className="p-3">Customer</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Time</th>
                        <th className="p-3">Guests</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 bg-gray-950/40">
                      {reservations.map((res) => (
                        <tr key={res.id} className="hover:bg-gray-800/30">
                          <td className="p-3 font-medium text-white">{res.customers?.name}<br/><span className="text-xs text-gray-500">{res.customers?.phone_number}</span></td>
                          <td className="p-3">{res.reservation_date}</td>
                          <td className="p-3">{res.reservation_time}</td>
                          <td className="p-3 text-orange-400 font-bold">{res.party_size} Ppl</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* Split View Right Control Column */}
            <div className="space-y-8">
              <section className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-md">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-orange-400">➕ Expand Live Menu</h2>
                  <button onClick={() => setActiveView('menu_focus')} className="text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-orange-400 px-3 py-1 rounded border border-gray-700 transition">⤢ Expand Screen</button>
                </div>
                <form onSubmit={handleAddMenuItem} className="space-y-3">
                  <input type="text" placeholder="Item Name" value={newItem.item_name} onChange={e => setNewItem({...newItem, item_name: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white focus:outline-none focus:border-orange-500" />
                  <input type="number" step="0.01" placeholder="Price (₹)" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white focus:outline-none focus:border-orange-500" />
                  <button type="submit" className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm font-bold transition">
                    {newItem.id ? 'Update Item' : 'Quick Add'}
                  </button>
                  {newItem.id && <button type="button" onClick={() => setNewItem({ item_name: '', description: '', price: '', category: 'Main' })} className="w-full py-1 text-gray-500 hover:text-white text-[10px] uppercase font-bold tracking-widest transition">Cancel Edit</button>}
                </form>
              </section>

              <section className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-md">
                <h2 className="text-xl font-bold mb-4 text-orange-400">💬 Customer Insights</h2>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {feedback.map((f) => (
                    <div key={f.id} className="p-3 bg-gray-950 rounded-lg border border-gray-800">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-xs text-gray-400">{f.customers?.name || 'Guest User'}</span>
                        <span className="text-yellow-400 font-bold text-xs">{'⭐'.repeat(f.rating)}</span>
                      </div>
                      <p className="text-xs text-gray-400 italic">"{f.comment}"</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* COMPLETED ARCHIVE BLOCK */}
          <section className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-inner mt-12">
            <h2 className="text-xl font-bold mb-4 text-gray-400">📦 Historical Archive (Completed Orders: {completedOrders.length})</h2>
            {completedOrders.length === 0 ? (
              <p className="text-sm text-gray-600">No completed items logged yet for today's run.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 opacity-60 hover:opacity-100 transition-opacity duration-200">
                {completedOrders.map(order => {
                  const dateObj = new Date(order.created_at);
                  const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const dateString = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

                  return (
                    <div key={order.id} className="p-3 bg-gray-950 rounded border border-gray-800 text-xs text-gray-400">
                      <div className="flex justify-between font-bold mb-1 text-gray-300">
                        <span>{order.customers?.name}</span>
                        <span className="text-emerald-500">₹{order.total_price}</span>
                      </div>
                      <p className="text-gray-500 font-mono">{order.customers?.phone_number}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5 mb-2">Done at: {timeString} • {dateString}</p>
                      <div className="border-t border-gray-900 pt-1 space-y-0.5">
                        {order.items?.map((i, k) => <div key={k}>• {i.qty}x {i.item_name}</div>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// Child Order Card
function OrderCard({ order, onUpdate }) {
  const formatOrderTime = (timestamp) => {
    if (!timestamp) return { time: '', date: '' };
    const dateObj = new Date(timestamp);
    const time = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    return { time, date };
  };

  const { time, date } = formatOrderTime(order.created_at);

  return (
    <div className="p-4 rounded-xl bg-gray-950 border border-gray-800 flex flex-col justify-between shadow-xl animate-fadeIn">
      <div>
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-bold text-white text-base tracking-tight truncate max-w-[70%]">{order.customers?.name || 'Guest User'}</h3>
          <span className={`px-2 py-0.5 text-[10px] font-black tracking-wider rounded uppercase ${
            order.status === 'pending' ? 'bg-amber-950 text-amber-400 border border-amber-900' : 'bg-blue-950 text-blue-400 border border-blue-900'
          }`}>{order.status}</span>
        </div>
        <p className="text-xs text-gray-500 font-mono mb-1">{order.customers?.phone_number}</p>
        
        <p className="text-[11px] text-orange-400/80 font-medium flex items-center gap-1 mb-4">
          🕒 Received: <span>{time}</span> • <span>{date}</span>
        </p>
        
        <ul className="space-y-2 text-sm text-gray-300 border-t border-b border-gray-900 py-3 my-3">
          {order.items?.map((item, index) => (
            <li key={index} className="flex justify-between">
              <span>• {item.qty}x <span className="text-orange-300 font-medium">{item.item_name}</span></span>
              <span className="text-gray-500">₹{(item.unit_price * item.qty).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-gray-500 block uppercase font-bold tracking-wider">Total due</span>
          <span className="text-xl font-black text-emerald-400">₹{order.total_price}</span>
        </div>
        <div>
          {order.status === 'pending' && (
            <button onClick={() => onUpdate(order.id, 'ready')} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition">Fire Cooking</button>
          )}
          {order.status === 'ready' && (
            <button onClick={() => onUpdate(order.id, 'completed')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition">Mark Handed Over</button>
          )}
        </div>
      </div>
    </div>
  );
}