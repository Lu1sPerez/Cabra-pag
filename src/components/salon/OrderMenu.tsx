'use client';
import React, { useState } from 'react';
// Importaciones de iconos (lucide-react suele venir por defecto en Next.js/Shadcn)
import { Plus, Minus, Send, Trash2 } from 'lucide-react';
// Importaciones simuladas de Shadcn UI
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// --- Tipos de Datos ---
type Category = { id: string; name: string };
type Product = { id: string; categoryId: string; name: string; price: number };
type CartItem = Product & { quantity: number; notes?: string };

// --- Datos de Prueba (Mock) ---
const categories: Category[] = [
  { id: 'c-1', name: 'Platos Principales' },
  { id: 'c-2', name: 'Bebidas' },
  { id: 'c-3', name: 'Postres' },
];

const products: Product[] = [
  { id: 'p-1', categoryId: 'c-1', name: 'Hamburguesa Clásica', price: 8500 },
  { id: 'p-2', categoryId: 'c-1', name: 'Milanesa Napolitana', price: 11200 },
  { id: 'p-3', categoryId: 'c-2', name: 'Cerveza Artesanal', price: 3500 },
  { id: 'p-4', categoryId: 'c-2', name: 'Agua con Gas', price: 1800 },
  { id: 'p-5', categoryId: 'c-3', name: 'Flan Mixto', price: 4200 },
];

export default function OrderMenu({ tableId }: { tableId: string }) {
  // Estado para la categoría seleccionada
  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0].id
  );
  // Estado para la comanda actual (carrito)
  const [cart, setCart] = useState<CartItem[]>([]);

  // Filtrar productos por categoría
  const filteredProducts = products.filter(
    (p) => p.categoryId === activeCategory
  );

  // --- Funciones del Carrito ---
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQuantity = Math.max(0, item.quantity + delta);
            return { ...item, quantity: newQuantity };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    ); // Elimina el item si llega a 0
  };

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const handleSendToKitchen = async () => {
    if (cart.length === 0) return;
    console.log(`Enviando comanda a cocina para la mesa ${tableId}`, cart);
    // Aquí llamarías al Server Action: await addOrderItem(tableId, product.id)
    alert('¡Comanda enviada a cocina!');
    setCart([]); // Limpiar carrito tras enviar
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] bg-slate-50 overflow-hidden">
      {/* SECCIÓN IZQUIERDA: Catálogo de Productos */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Navegación de Categorías */}
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? 'default' : 'outline'}
              onClick={() => setActiveCategory(cat.id)}
              className="rounded-full px-6"
            >
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Grilla de Productos */}
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className="cursor-pointer hover:border-blue-500 hover:shadow-md transition-all h-32 flex flex-col justify-between"
                onClick={() => addToCart(product)}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <span className="font-semibold text-slate-800 line-clamp-2">
                    {product.name}
                  </span>
                  <span className="text-blue-600 font-bold">
                    ${product.price.toLocaleString('es-AR')}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* SECCIÓN DERECHA: Panel de la Comanda (Ticket) */}
      <div className="w-full lg:w-96 bg-white border-l shadow-xl flex flex-col z-10 h-full">
        {/* Cabecera del Ticket */}
        <div className="p-4 bg-slate-800 text-white flex justify-between items-center">
          <h2 className="text-lg font-bold">Comanda Actual</h2>
          <Badge variant="secondary" className="bg-slate-700 text-white">
            Mesa {tableId}
          </Badge>
        </div>

        {/* Lista de Ítems */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {cart.length === 0 ? (
            <div className="text-center text-slate-400 mt-10">
              Aún no hay productos en la comanda.
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border"
              >
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{item.name}</p>
                  <p className="text-sm text-slate-500">
                    ${item.price.toLocaleString('es-AR')}
                  </p>
                </div>

                {/* Controles de cantidad */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => updateQuantity(item.id, -1)}
                    className="p-1 rounded-md bg-white border shadow-sm hover:bg-slate-100 text-slate-600"
                  >
                    {item.quantity === 1 ? (
                      <Trash2 size={16} className="text-red-500" />
                    ) : (
                      <Minus size={16} />
                    )}
                  </button>
                  <span className="font-bold w-6 text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.id, 1)}
                    className="p-1 rounded-md bg-white border shadow-sm hover:bg-slate-100 text-slate-600"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Resumen y Botón de Envío */}
        <div className="p-4 bg-slate-50 border-t">
          <div className="flex justify-between items-center mb-4 text-lg">
            <span className="font-semibold text-slate-600">Total:</span>
            <span className="font-bold text-2xl text-slate-900">
              ${total.toLocaleString('es-AR')}
            </span>
          </div>

          <Button
            className="w-full h-14 text-lg gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            disabled={cart.length === 0}
            onClick={handleSendToKitchen}
          >
            <Send size={20} />
            Enviar a Cocina
          </Button>
        </div>
      </div>
    </div>
  );
}
