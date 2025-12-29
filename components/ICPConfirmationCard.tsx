"use client";

import { Check, X, Edit2 } from "lucide-react";
import { useState } from "react";
import { ICPData } from "@/types/icp";

interface ICPConfirmationCardProps {
  section: string;
  fields: { key: keyof ICPData; label: string; value: string | undefined }[];
  onConfirm: () => void;
  onEdit: (field: keyof ICPData, value: string) => void;
}

export default function ICPConfirmationCard({
  section,
  fields,
  onConfirm,
  onEdit,
}: ICPConfirmationCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  const handleEdit = (key: keyof ICPData, currentValue: string) => {
    setEditedValues({ ...editedValues, [key]: currentValue });
    setIsEditing(true);
  };

  const handleSave = () => {
    Object.entries(editedValues).forEach(([key, value]) => {
      onEdit(key as keyof ICPData, value);
    });
    setIsEditing(false);
    setEditedValues({});
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedValues({});
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{section}</h4>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="rounded p-1 hover:bg-green-500/10 transition-colors"
                aria-label="Save"
              >
                <Check className="h-4 w-4 text-green-600" />
              </button>
              <button
                onClick={handleCancel}
                className="rounded p-1 hover:bg-red-500/10 transition-colors"
                aria-label="Cancel"
              >
                <X className="h-4 w-4 text-red-600" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => fields.forEach(f => handleEdit(f.key, f.value || ''))}
                className="rounded p-1 hover:bg-accent transition-colors"
                aria-label="Edit"
              >
                <Edit2 className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={onConfirm}
                className="rounded p-1 hover:bg-green-500/10 transition-colors"
                aria-label="Confirm"
              >
                <Check className="h-4 w-4 text-green-600" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {fields.map((field) => {
          if (!field.value) return null;
          
          return (
            <div key={field.key} className="text-sm">
              <span className="font-medium text-muted-foreground">{field.label}:</span>{" "}
              {isEditing && editedValues[field.key] !== undefined ? (
                <input
                  type="text"
                  value={editedValues[field.key]}
                  onChange={(e) =>
                    setEditedValues({ ...editedValues, [field.key]: e.target.value })
                  }
                  className="ml-1 rounded border border-input bg-background px-2 py-1 text-foreground"
                />
              ) : (
                <span className="text-foreground">{field.value}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

