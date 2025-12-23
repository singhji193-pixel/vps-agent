/**
 * Approval Dialog Component
 * Handles command approval workflow for potentially dangerous operations
 */

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Play, Square } from "lucide-react";

interface PendingApproval {
  command: string;
  explanation: string;
  toolCallId: string;
}

interface ApprovalDialogProps {
  open: boolean;
  pendingApproval: PendingApproval | null;
  onApprove: (approved: boolean) => void;
}

export function ApprovalDialog({ open, pendingApproval, onApprove }: ApprovalDialogProps) {
  if (!pendingApproval) return null;

  return (
    <Dialog open={open} onOpenChange={() => onApprove(false)}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500 shrink-0" />
            <span>Approval Required</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            The agent wants to execute a potentially dangerous command.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 sm:space-y-4">
          <div>
            <p className="text-xs sm:text-sm font-medium mb-1 sm:mb-2">Command:</p>
            <pre className="bg-muted p-2 sm:p-3 rounded text-xs sm:text-sm overflow-x-auto max-h-32">
              {pendingApproval.command}
            </pre>
          </div>
          <div>
            <p className="text-xs sm:text-sm font-medium mb-1 sm:mb-2">Explanation:</p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {pendingApproval.explanation}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={() => onApprove(false)} 
            className="w-full sm:w-auto"
          >
            Reject
          </Button>
          <Button 
            onClick={() => onApprove(true)} 
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
          >
            <Play className="h-4 w-4 mr-2" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
